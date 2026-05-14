# Blame Heatmap

Chrome Extension (Manifest V3) that injects a visual commit-frequency heatmap into GitHub file views.

## Setup

1. Clone this repository:

   ```bash
   git clone <your-repo-url>
   cd blame-heatmap
   ```

2. In Chrome, open `chrome://extensions`.

3. Enable **Developer mode** (top right).

4. Click **Load unpacked** and select this folder.

5. Open a GitHub file URL such as `https://github.com/owner/repo/blob/main/path/to/file.ext`.

6. Click the `🔥 Heat Map` button in the file toolbar.

## GitHub Token

To support private repositories and higher rate limits, create a GitHub Personal Access Token with **read access to code** (classic tokens: `repo` scope). [web:7][web:13]

Then:

- Right-click the extension icon → **Options**, or visit **chrome://extensions** → Blame Heatmap → Details → Extension options.
- Paste the token and save.

## Notes

- Heatmap currently wires the UI. Commit frequency and blame analysis will be added next.
- The extension uses the GitHub REST API for commit history and the GitHub GraphQL API for blame data.