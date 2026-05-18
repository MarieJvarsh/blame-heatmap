// options.js
(function () {
  const tokenInput = document.getElementById("token");
  const saveBtn    = document.getElementById("save");
  const clearBtn   = document.getElementById("clear");
  const statusEl   = document.getElementById("status");

  // Load saved token on open
  chrome.storage.sync.get(["githubToken"], (res) => {
    if (res.githubToken) tokenInput.value = res.githubToken;
  });

  saveBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    if (!token) { flash("Enter a token first.", "error"); return; }
    chrome.storage.sync.set({ githubToken: token }, () => flash("Token saved ✓", "ok"));
  });

  clearBtn.addEventListener("click", () => {
    chrome.storage.sync.remove("githubToken", () => {
      tokenInput.value = "";
      flash("Token cleared.", "ok");
    });
  });

  // Allow Enter key to save
  tokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
  });

  function flash(msg, type) {
    statusEl.textContent = msg;
    statusEl.style.color = type === "ok" ? "#6daa45" : "#dd6974";
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  }
})();
