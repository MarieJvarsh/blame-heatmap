# 🔥 Blame Heatmap

Blame Heatmap is a Chrome extension that overlays GitHub file views with commit‑history insights.

It fetches Git blame data for the current file and shows a panel with:

- Lines analysed and total commits
- Hotspot line (touched by the most distinct commits)
- Bands: Hot / Warm / Cool based on commit counts per line
- Above vs below average lines
- A mini sparkline of commit density across the file
- A note when the file has almost no history (all changed lines have the same commit count)

> Note: GitHub currently renders some files as a single `<textarea>`. On those views you’ll see stats + sparkline, but not coloured gutters per line.

---

## Install and run locally (unpacked extension)

You can run Blame Heatmap locally in any Chromium‑based browser (Chrome, Edge, Brave, etc.).

### 1. Clone the repo

```bash
git clone https://github.com/MarieJvarsh/blame-heatmap.git
cd blame-heatmap
```

There’s no build step – everything is plain HTML/CSS/JS.

### 2. Load as an unpacked extension

1. Open `chrome://extensions` in your browser.
2. Turn on **Developer mode** (top right).
3. Click **“Load unpacked”**.
4. Select the `blame-heatmap` folder you just cloned.

You should now see **Blame Heatmap** in your extensions list with its icon.

---

## Optional: configure a GitHub Personal Access Token

Without a token, GitHub’s unauthenticated API limit is low (60 requests/hour).  
Adding a token lifts that limit and enables private repos you have access to.

1. In the extensions list, find **Blame Heatmap** → click **Details** → **Extension options**  
   (or right‑click the extension icon → **Options**).
2. Generate a GitHub Personal Access Token (classic or fine‑grained) with **read‑only code** access.
3. Paste the token into the field and click **Save token**.

The token is stored in `chrome.storage.sync` and is only used to authenticate calls directly from your browser to `api.github.com`.

---

## Usage

1. Open any GitHub file page (not a diff), e.g. `https://github.com/user/repo/blob/main/file.js`.
2. In the file toolbar, click the **🔥 Heat Map** button.
3. A floating **Blame Heatmap** panel appears:
   - Drag it around the page if it overlaps something important.
   - Click the ✕ button or toggle **Heat Map** off to close it.

The panel shows:

- **Lines analysed** and **total commits**
- **Avg commits/line**
- **Hotspot** line and commit count
- **Bands** (Hot / Warm / Cool)
- **Above vs below average** lines
- A small **sparkline** of commit density across the file
- A rate‑limit warning if you hit GitHub’s API limits

For best results, use it on files with a longer history – very new or rarely changed files will produce a very “flat” heatmap (and the panel will tell you that).