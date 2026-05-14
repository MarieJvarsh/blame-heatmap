// popup.js

const info = document.getElementById("info");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes("github.com")) {
    info.textContent = "This tab is not a GitHub file view.";
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    { type: "GET_CURRENT_HEATMAP_STATS" },
    (response) => {
      if (chrome.runtime.lastError) {
        info.textContent = "Heatmap not active on this page.";
        return;
      }
      if (!response || !response.active) {
        info.textContent = "Heatmap not active on this page.";
        return;
      }

      info.innerHTML =
        `<div class="stat">Lines analyzed: <span class="accent">${response.linesAnalyzed}</span></div>` +
        `<div class="stat">Hotspot line: <span class="accent">${response.hotspotLine}</span> (${response.hotspotCommits} commits)</div>`;
    }
  );
});