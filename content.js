// content.js

const NEXUS_SURFACE_DARK = "#1c1b19";
const NEXUS_TEAL = "#4f98a3";
const COOL_BLUE = "#c6d8e4";
const WARM_YELLOW = "#e8af34";
const HOT_RED = "#dd6974";

let heatmapEnabled = false;

// Parse owner, repo, ref, path from URL like /owner/repo/blob/ref/path/to/file
function parseGitHubBlobUrl() {
  const { pathname } = window.location;
  const parts = pathname.split("/").filter(Boolean);

  // Expected: ["owner", "repo", "blob", "ref", "path", "to", "file"]
  if (parts.length < 5 || parts[2] !== "blob") {
    return null;
  }

  const owner = parts[0];
  const repo = parts[1];
  const ref = parts[3];
  const path = parts.slice(4).join("/");

  return { owner, repo, ref, path };
}

// Inject toggle button next to "Blame"
function injectToggleButton() {
  // GitHub toolbar container near Raw / Blame
  const toolbar = document.querySelector(".BlobToolbar .BtnGroup") ||
                  document.querySelector("div.d-flex.flex-items-center.mb-3 .BtnGroup");

  if (!toolbar || document.querySelector("#blame-heatmap-toggle")) {
    return;
  }

  const btn = document.createElement("button");
  btn.id = "blame-heatmap-toggle";
  btn.textContent = "🔥 Heat Map";
  btn.type = "button";
  btn.className = "btn btn-sm BtnGroup-item"; // Reuse GitHub styles
  btn.style.fontFamily = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  btn.style.display = "inline-flex";
  btn.style.alignItems = "center";
  btn.style.gap = "4px";

  btn.addEventListener("click", () => {
    heatmapEnabled = !heatmapEnabled;
    if (heatmapEnabled) {
      startHeatmap();
    } else {
      clearHeatmap();
    }
  });

  toolbar.appendChild(btn);
}

// Placeholder: we’ll implement the full heatmap next
function startHeatmap() {
  const parsed = parseGitHubBlobUrl();
  if (!parsed) {
    console.warn("Blame Heatmap: not a supported blob URL");
    return;
  }
  console.log("Blame Heatmap enabled for", parsed);
  // Next step: send message to background, compute line scores, color borders, show legend
}

function clearHeatmap() {
  console.log("Blame Heatmap disabled");
  // Next step: remove borders and legend
}

// Observe DOM in case GitHub SPA navigation changes file without full reload
const observer = new MutationObserver(() => {
  injectToggleButton();
});

injectToggleButton();
observer.observe(document.body, { childList: true, subtree: true });