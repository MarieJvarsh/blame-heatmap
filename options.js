// options.js

const tokenInput = document.getElementById("token");
const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");

chrome.storage.sync.get(["githubToken"], (res) => {
  if (res.githubToken) {
    tokenInput.value = res.githubToken;
  }
});

saveButton.addEventListener("click", () => {
  const token = tokenInput.value.trim();
  chrome.storage.sync.set({ githubToken: token }, () => {
    statusEl.textContent = "Token saved.";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
});