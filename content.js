// content.js — injected into github.com/*/*/blob/* pages
;(function () {
  "use strict";

  // ── Constants ─────────────────────────────────────────────────────────────
  const COOL_BLUE   = "#c6d8e4";
  const WARM_YELLOW = "#e8af34";
  const HOT_RED     = "#dd6974";
  const NEXUS_TEAL  = "#4f98a3";
  const MAX_LINES   = 1000;

  // ── State ─────────────────────────────────────────────────────────────────
  let heatmapEnabled = false;
  let lineStats      = null;
  let lastError      = null;
  let rateLimitInfo  = null;
  let cachedHasToken = null;
  // Keep a reference to the line elements used so clearHeatmap removes from same set
  let activeLineEls  = null;

  // ── URL parsing ───────────────────────────────────────────────────────────
  function parseGitHubBlobUrl() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    // pathname: /owner/repo/blob/ref/path/to/file
    if (parts.length < 5 || parts[2] !== "blob") return null;
    return {
      owner: parts[0],
      repo:  parts[1],
      ref:   parts[3],
      path:  parts.slice(4).join("/"),  // no leading slash
    };
  }

  // ── Token cache ───────────────────────────────────────────────────────────
  chrome.storage.sync.get(["githubToken"], (res) => {
    cachedHasToken = !!res.githubToken;
  });

  // ── Toolbar button injection ──────────────────────────────────────────────
  function injectToggleButton() {
    if (document.getElementById("blame-heatmap-toggle")) return;

    let toolbar = null;

    // 1. Look for a BtnGroup that contains Raw or Blame links
    const btnGroups = document.querySelectorAll(".BtnGroup");
    for (const group of btnGroups) {
      const texts = Array.from(group.querySelectorAll("button, a"))
        .map((el) => el.textContent.trim());
      if (texts.some((t) => t === "Raw" || t === "Blame")) {
        toolbar = group;
        break;
      }
    }

    // 2. React new blob header selectors
    if (!toolbar) {
      const candidates = [
        "[data-testid='blob-header-actions']",
        ".react-blob-header-edit-and-raw-actions",
        ".BlobToolbar",
        "[data-testid='blob-raw-button']",
        ".d-flex.flex-items-center.gap-2",
        "div[class*='BlobToolbar']",
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) {
          // If we matched a button, go up to the container
          toolbar = el.tagName === "BUTTON" || el.tagName === "A"
            ? el.closest(".BtnGroup, .d-flex, [class*='actions']") || el.parentElement
            : el;
          break;
        }
      }
    }

    // 3. Last resort: find the "Raw" element anywhere and use its parent
    if (!toolbar) {
      const rawEl = Array.from(document.querySelectorAll("a, button"))
        .find((el) => /^raw$/i.test(el.textContent.trim()));
      if (rawEl) {
        toolbar = rawEl.closest(".BtnGroup, .d-flex, [class*='actions']") || rawEl.parentElement;
      }
    }

    if (!toolbar) return; // retry via MutationObserver

    const btn = document.createElement("button");
    btn.id        = "blame-heatmap-toggle";
    btn.type      = "button";
    btn.textContent = "🔥 Heat Map";
    btn.style.cssText = [
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:12px",
      "padding:4px 10px",
      "border-radius:6px",
      "border:1px solid rgba(205,217,229,0.2)",
      "background:#21262d",
      "color:#e6edf3",
      "cursor:pointer",
      "margin-left:8px",
      "display:inline-flex",
      "align-items:center",
      "gap:4px",
      "white-space:nowrap",
      "vertical-align:middle",
    ].join(";");

btn.addEventListener("click", () => {
  if (heatmapEnabled) {
    // Turn OFF via central helper
    deactivateHeatmap();
    return;
  }

  // Turn ON
  heatmapEnabled = true;
  btn.style.background   = "#1a3a3d";
  btn.style.borderColor  = "rgba(79,152,163,0.6)";
  btn.style.color        = NEXUS_TEAL;
  btn.textContent        = "🔥 Heat Map ✓";
  startHeatmap();
}); 
   toolbar.appendChild(btn);
    console.log("Blame Heatmap: button injected ✅");
  }

  // ── Line element discovery ────────────────────────────────────────────────
  // Returns an array whose indices correspond 1-to-1 with code line numbers.
  // Each element is the DOM node that will receive the border-left coloring.
function getCodeLineElements() {
  // Strategy A: classic table — use the line-number <td> as gutter target
  const numCells = document.querySelectorAll("td.blob-num");
  if (numCells.length) return Array.from(numCells);

  // Strategy B: React new code view (if GitHub exposes per-line elements)
  const reactLines = document.querySelectorAll(".react-code-view-line");
  if (reactLines.length) return Array.from(reactLines);

  // Strategy C: older classic view inner spans
  const innerSpans = document.querySelectorAll(".blob-code-inner");
  if (innerSpans.length) return Array.from(innerSpans);

  // Strategy D: js-file-line
  const jsLines = document.querySelectorAll(".js-file-line");
  if (jsLines.length) return Array.from(jsLines);

  // Strategy E: table rows in highlight table
  const tableRows = document.querySelectorAll("table.highlight tr");
  if (tableRows.length) return Array.from(tableRows);

  // Strategy F: textarea-based React blob view (like your screenshot)
  const textarea = document.querySelector(
    "textarea.react-blob-textarea[aria-label='file content']"
  );
  if (textarea) {
    // Split on newlines and create a synthetic array of "line" placeholders
    const lineCount = textarea.value.split("\n").length;
    return Array.from({ length: lineCount }, (_, i) => ({ __bhLine__: i + 1 }));
  }

  return [];
}
  // ── Heatmap on ───────────────────────────────────────────────────────────
  function startHeatmap() {
    const parsed = parseGitHubBlobUrl();
    if (!parsed) {
      showBanner("Blame Heatmap: Not a supported GitHub file URL.");
      return;
    }

    const lines = getCodeLineElements();

    if (!lines.length) {
      showBanner("Blame Heatmap: No code lines found on this page. Try scrolling to load the file.");
      return;
    }
    if (lines.length > MAX_LINES) {
      showBanner(`Blame Heatmap: File too large (${lines.length} lines > ${MAX_LINES}). Heatmap disabled.`);
      return;
    }

    lastError     = null;
    rateLimitInfo = null;
    showBanner(null);
    activeLineEls = lines;

    const { owner, repo, ref, path } = parsed;
    console.log("Blame Heatmap: fetching", { owner, repo, ref, path });

    chrome.runtime.sendMessage(
      { type: "FETCH_COMMITS_AND_BLAME", owner, repo, ref, path },
      (response) => {
        if (chrome.runtime.lastError) {
          showBanner("Blame Heatmap: Could not reach background script. Try reloading the extension.");
          lastError = chrome.runtime.lastError.message;
          resetButton();
          return;
        }

        if (!response || !response.ok) {
          lastError = response && response.error;
          if (response && response.status === 403 && response.rateLimitReset) {
            const resetDate = new Date(parseInt(response.rateLimitReset, 10) * 1000);
            rateLimitInfo   = resetDate;
            showBanner(`Blame Heatmap: GitHub rate limit hit. Resets at ${resetDate.toLocaleTimeString()}.`);
          } else if (response && !response.hasPAT) {
            showBanner("Blame Heatmap: Add a GitHub token in Options for private repos and higher rate limits.");
          } else {
            showBanner(`Blame Heatmap: API error — ${(response && response.error) || "unknown"}.`);
          }
          resetButton();
          return;
        }

        rateLimitInfo = response.rateLimitReset
          ? new Date(parseInt(response.rateLimitReset, 10) * 1000)
          : null;

        if (!response.hasPAT) {
          showBanner("Blame Heatmap: No GitHub token set. Add one in Options for higher rate limits.");
        }

        try {
          lineStats = computeLineStatsFromBlame(lines.length, response.commits, response.blame);
          applyHeatmapToDom(lines, lineStats);
          createOrUpdateLegend(lineStats);
        } catch (e) {
          console.error("Blame Heatmap: processing error", e);
          lastError = e.message;
          showBanner("Blame Heatmap: Error processing blame data — " + e.message);
          resetButton();
        }
      }
    );
  }

function resetButton() {
  const btn = document.getElementById("blame-heatmap-toggle");
  if (!btn) return;
  btn.style.background  = "#21262d";
  btn.style.borderColor = "rgba(205,217,229,0.2)";
  btn.style.color       = "#e6edf3";
  btn.textContent       = "🔥 Heat Map";
}

  // ── Heatmap off ───────────────────────────────────────────────────────────
function clearHeatmap() {
  // Clear whichever elements were actually colored
  const targets = activeLineEls
    ? activeLineEls
    : Array.from(
        document.querySelectorAll(
          "td.blob-num, .react-code-view-line, .blob-code-inner, .js-file-line, table.highlight tr"
        )
      );

  targets.forEach((el) => {
    if (!el || !el.style) return;
    el.style.borderLeft = "";
    el.style.paddingLeft = "";
  });

  activeLineEls = null;
  removeLegend();
  showBanner(null);
  lineStats = null;
  lastError = null;
  console.log("Blame Heatmap: disabled");
}
function deactivateHeatmap() {
  heatmapEnabled = false;
  clearHeatmap();
  resetButton();
}

  // ── Blame stats computation ───────────────────────────────────────────────
  function computeLineStatsFromBlame(lineCount, commits, blameData) {
    // Safe path: blameData → repository → object → blame → ranges
    const ranges =
      blameData &&
      blameData.repository &&
      blameData.repository.object &&
      blameData.repository.object.blame &&
      blameData.repository.object.blame.ranges;

    if (!ranges || !Array.isArray(ranges)) {
      throw new Error("No blame ranges in API response. File may be binary or the ref is wrong.");
    }

    const perLineCommitSets = Array.from({ length: lineCount }, () => new Set());
    const commitOidSet = new Set();

    for (const r of ranges) {
      const start = Math.max(1, r.startingLine);
      const end   = Math.min(lineCount, r.endingLine);
      const oid   = r.commit && r.commit.oid;
      if (!oid) continue;
      commitOidSet.add(oid);
      for (let line = start; line <= end; line++) {
        perLineCommitSets[line - 1].add(oid);
      }
    }

    const perLineCommits = perLineCommitSets.map((s) => s.size);
    const maxCommits     = perLineCommits.reduce((m, c) => Math.max(m, c), 0) || 1;
    const totalCommits   = commits ? commits.length : commitOidSet.size;
    

    let hotspotLine    = 1;
    let hotspotCommits = 0;
    perLineCommits.forEach((count, idx) => {
      if (count > hotspotCommits) {
        hotspotCommits = count;
        hotspotLine    = idx + 1;
      }
    });

const avgCommits = totalCommits > 0 && lineCount > 0
  ? totalCommits / lineCount
  : 0;

const { p50, p90 } = buildBands(perLineCommits);

return {
  lineCount,
  perLineCommits,
  maxCommits,
  hotspotLine,
  hotspotCommits,
  totalCommits,
  avgCommits,
  p50,
  p90
};}

  function buildBands(perLineCommits) {
  const counts = perLineCommits.slice().sort((a, b) => a - b);
  const n = counts.length || 1;

  const p50Index = Math.floor(0.5 * (n - 1));
  const p90Index = Math.floor(0.9 * (n - 1));

  const p50 = counts[p50Index];
  const p90 = counts[p90Index];

  return { p50, p90 };
}

  // ── Color helpers ─────────────────────────────────────────────────────────
  function commitCountToColor(count, max) {
    const t = max > 0 ? count / max : 0;
    return t <= 0.5
      ? lerpColor(COOL_BLUE,   WARM_YELLOW, t / 0.5)
      : lerpColor(WARM_YELLOW, HOT_RED,     (t - 0.5) / 0.5);
  }

  function lerpColor(hexA, hexB, t) {
    const a  = hexToRgb(hexA);
    const b  = hexToRgb(hexB);
    const r  = Math.round(a.r + (b.r - a.r) * t);
    const g  = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function hexToRgb(hex) {
    const num = parseInt(hex.replace("#", ""), 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  // ── Apply colors ──────────────────────────────────────────────────────────
function applyHeatmapToDom(lines, stats) {
  const { perLineCommits, maxCommits } = stats;

  lines.forEach((el, idx) => {
    // Placeholder for textarea-based view: no DOM element to color
    if (el && el.__bhLine__) {
      return;
    }

    const count = perLineCommits[idx] || 0;
    if (!el || !el.style) return;

    el.style.borderLeft = count > 0
      ? `3px solid ${commitCountToColor(count, maxCommits)}`
      : "3px solid transparent";
    el.style.paddingLeft = "4px";
  });
}

  // ── Legend ────────────────────────────────────────────────────────────────
  function createOrUpdateLegend(stats) {
    let legend = document.querySelector(".blame-heatmap-legend");
    if (!legend) {
      legend = document.createElement("div");
      legend.className = "blame-heatmap-legend";
      document.body.appendChild(legend);
      makeLegendDraggable(legend);
    }

    const top5 = stats.perLineCommits
      .map((c, i) => ({ line: i + 1, count: c }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

// 1) Basic counts
const values = stats.perLineCommits;

// 2) Sparkline data
const maxVal = values.reduce((m, v) => Math.max(m, v), 0) || 1;
const normalized = values.map((v) => v / maxVal);
const sparkWidth = 160;
const sparkHeight = 30;
const sparkPath = buildSparklinePath(normalized, sparkWidth, sparkHeight);

// 3) Band logic using avg + max
const avg = stats.avgCommits;
const max = stats.maxCommits;

// Hot: lines at the max count
const hotCount  = values.filter((c) => c === max && c > 0).length;
// Warm: between avg and max
const warmCount = values.filter((c) => c > avg && c < max).length;
// Cool: > 0 but ≤ avg
const coolCount = values.filter((c) => c > 0 && c <= avg).length;

// Above vs below/eq average
const aboveAvgCount     = values.filter((c) => c > avg).length;
const belowOrEqAvgCount = values.length - aboveAvgCount;

//flat check
const nonZeroCounts = new Set(values.filter((c) => c > 0));
const isFlatHistory = nonZeroCounts.size <= 1;

legend.innerHTML = `
  <div class="bhm-close" title="Close">✕</div>
  <h2>🔥 Blame Heatmap</h2>

  <div class="scale">
    <span style="font-size:0.72rem">Cool</span>
    <div class="scale-bar"></div>
    <span style="font-size:0.72rem">Hot</span>
  </div>

  <div class="stats">
    <div>Lines analysed: <strong>${stats.lineCount}</strong></div>
    <div>Total commits: <strong>${stats.totalCommits}</strong></div>
    <div>Avg commits/line: <strong>${stats.avgCommits.toFixed(2)}</strong></div>
    <div>Hotspot: <strong>L${stats.hotspotLine}</strong> (${stats.hotspotCommits} commits)</div>
  </div>

    <div class="sparkline">
    <div style="font-size:0.75rem; margin-bottom:2px;">Commit density by line</div>
    <svg width="${sparkWidth}" height="${sparkHeight}">
      <path d="${sparkPath}" fill="none" stroke="${NEXUS_TEAL}" stroke-width="1.2" />
    </svg>
  </div>


  <div class="bands">
    <div><strong>Bands</strong></div>
    <div>Hot (max ${max} commits): <strong>${hotCount}</strong> lines</div>
    <div>Warm (> avg, &lt; max): <strong>${warmCount}</strong> lines</div>
    <div>Cool (≤ avg, &gt; 0): <strong>${coolCount}</strong> lines</div>
  </div>

  <div class="avg-bucket">
    <div><strong>Above vs below average</strong></div>
    <div>Above avg: <strong>${aboveAvgCount}</strong> lines</div>
    <div>At or below avg: <strong>${belowOrEqAvgCount}</strong> lines</div>
  </div>

  ${
    isFlatHistory
      ? `<div class="flat-note">This file has very little history: all changed lines have the same commit count.</div>`
      : ""
  }

  ${
    top5.length
      ? `
        <div class="top5-title">Top 5 changed lines</div>
        <ul class="top5-list">
          ${top5
            .map(
              (x) =>
                `<li>L${x.line} — ${x.count} commit${
                  x.count !== 1 ? "s" : ""
                }</li>`
            )
            .join("")}
        </ul>
      `
      : ""
  }

  ${
    rateLimitInfo
      ? `<div class="rate-warn">⚠ Rate limit resets ${rateLimitInfo.toLocaleTimeString()}</div>`
      : ""
  }
`;

legend.querySelector(".bhm-close").addEventListener("click", () => {
  deactivateHeatmap();
});} 
function removeLegend() {
  const legend = document.querySelector(".blame-heatmap-legend");
  if (legend && legend.parentNode) {
    legend.parentNode.removeChild(legend);
  }
}

function buildSparklinePath(normalizedValues, width, height) {
  if (!normalizedValues.length) return "";

  const n = normalizedValues.length;
  const stepX = width / Math.max(n - 1, 1);

  return normalizedValues
    .map((v, i) => {
      const x = i * stepX;
      const y = height - v * height; // higher value -> lower y
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

  function makeLegendDraggable(el) {
    let isDragging = false, startX, startY, startLeft, startTop;
    el.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("bhm-close")) return;
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.left   = `${startLeft + e.clientX - startX}px`;
      el.style.top    = `${startTop  + e.clientY - startY}px`;
      el.style.right  = "auto";
      el.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => { isDragging = false; });
  }

  // ── Banner ────────────────────────────────────────────────────────────────
  function showBanner(message) {
    let banner = document.querySelector(".blame-heatmap-banner");
    if (!message) { banner?.remove(); return; }
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "blame-heatmap-banner";
      document.body.prepend(banner);
    }
    banner.textContent = message;
  }

  // ── Popup stats responder ─────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "GET_CURRENT_HEATMAP_STATS") return false;
    if (!lineStats || !heatmapEnabled) {
      sendResponse({ active: false });
    } else {
      sendResponse({
        active:         true,
        linesAnalyzed:  lineStats.lineCount,
        hotspotLine:    lineStats.hotspotLine,
        hotspotCommits: lineStats.hotspotCommits,
        totalCommits:   lineStats.totalCommits,
      });
    }
    return true;
  });

  // ── SPA navigation watcher ────────────────────────────────────────────────
  // GitHub is a SPA — URL changes without full page reload.
  // Debounce to avoid firing hundreds of times per DOM mutation burst.
  let lastUrl      = location.href;
  let debounceId   = null;

  const navObserver = new MutationObserver(() => {
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Reset everything on navigation
        if (heatmapEnabled) { clearHeatmap(); heatmapEnabled = false; }
        document.getElementById("blame-heatmap-toggle")?.remove();
      }
      injectToggleButton();
    }, 250);
  });

  navObserver.observe(document.body, { childList: true, subtree: true });
  injectToggleButton();

})();
