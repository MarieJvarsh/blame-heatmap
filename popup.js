// popup.js
(function () {
  const info = document.getElementById("info");

  document.getElementById("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Must go through background.js — popups cannot message content scripts directly in MV3.
  chrome.runtime.sendMessage({ type: "POPUP_GET_STATS" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.active) {
      info.innerHTML =
        '<p class="inactive">Heatmap not active.<br>' +
        'Open a GitHub file and click <strong style="color:#e6edf3">🔥 Heat Map</strong> in the toolbar.</p>';
      return;
    }

    info.innerHTML = `
      <div class="stat">Lines analysed: <strong>${response.linesAnalyzed}</strong></div>
      <div class="stat">Total commits: <strong>${response.totalCommits}</strong></div>
      <div class="stat">Hotspot: <strong>L${response.hotspotLine}</strong></div>
      <div class="stat">Hotspot commits: <strong>${response.hotspotCommits}</strong></div>
      <div class="scale-wrap">
        <span class="scale-label">Cool</span>
        <div class="scale-bar"></div>
        <span class="scale-label">Hot</span>
      </div>
    `;
  });
})();
