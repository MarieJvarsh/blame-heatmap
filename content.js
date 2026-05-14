// content.js

let heatmapEnabled = false;

function parseGitHubBlobUrl() {
  const { pathname } = window.location;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "blob") return null;
  return {
    owner: parts[0],
    repo: parts[1],
    ref: parts[3],
    path: parts.slice(4).join("/")
  };
}

function injectToggleButton() {
  if (document.querySelector("#blame-heatmap-toggle")) return;

  // Try multiple selectors — GitHub updates its UI frequently
  const toolbar =
    document.querySelector(".react-blob-header-edit-and-raw-actions") ||
    document.querySelector(".BlobToolbar") ||
    document.querySelector("[data-testid='blob-raw-button']")?.closest("div") ||
    document.querySelector(".d-flex.flex-items-center.gap-2") ||
    document.querySelector("div[class*='BlobToolbar']");

  if (!toolbar) {
    console.warn("Blame Heatmap: toolbar not found on this page");
    return;
  }

  const btn = document.createElement("button");
  btn.id = "blame-heatmap-toggle";
  btn.textContent = "🔥 Heat Map";
  btn.type = "button";
  btn.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid rgba(205,217,229,0.2);
    background: #21262d;
    color: #e6edf3;
    cursor: pointer;
    margin-left: 8px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  `;

  btn.addEventListener("click", () => {
    heatmapEnabled = !heatmapEnabled;
    btn.style.background = heatmapEnabled ? "#4f98a3" : "#21262d";
    if (heatmapEnabled) {
      startHeatmap();
    } else {
      clearHeatmap();
    }
  });

  toolbar.appendChild(btn);
  console.log("Blame Heatmap: button injected ✅");
}

function startHeatmap() {
  const parsed = parseGitHubBlobUrl();
  if (!parsed) {
    console.warn("Blame Heatmap: not a supported blob URL");
    return;
  }
  console.log("Blame Heatmap enabled for", parsed);
}

function clearHeatmap() {
  console.log("Blame Heatmap disabled");
}

// Re-inject on GitHub SPA navigation
const observer = new MutationObserver(() => {
  injectToggleButton();
});

injectToggleButton();
observer.observe(document.body, { childList: true, subtree: true });