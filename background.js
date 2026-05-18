// background.js — service worker
// Handles all GitHub API calls and relays popup ↔ content messages.

// ── Storage ───────────────────────────────────────────────────────────────────
async function getToken() {
  return new Promise((resolve) =>
    chrome.storage.sync.get(["githubToken"], (res) => resolve(res.githubToken || null))
  );
}

// ── REST helper ───────────────────────────────────────────────────────────────
async function githubRestFetch(url, token) {
  const headers = { "Accept": "application/vnd.github+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "GET", headers });
  const rateLimitReset = res.headers.get("X-RateLimit-Reset");
  const remaining      = res.headers.get("X-RateLimit-Remaining");

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, message: body.message || "GitHub API error", rateLimitReset, remaining };
  }

  const data = await res.json();
  return { data, rateLimitReset, remaining };
}

// ── GraphQL helper ─────────────────────────────────────────────────────────────
async function githubGraphqlFetch(query, variables, token) {
  const headers = {
    "Accept":       "application/vnd.github+json",
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res  = await fetch("https://api.github.com/graphql", {
    method: "POST", headers, body: JSON.stringify({ query, variables }),
  });
  const rateLimitReset = res.headers.get("X-RateLimit-Reset");
  const remaining      = res.headers.get("X-RateLimit-Remaining");

  // GraphQL always returns 200; errors live inside json.errors
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.errors && json.errors.length)) {
    throw {
      status:  res.status,
      message: (json.errors && json.errors[0] && json.errors[0].message) || "GraphQL error",
      rateLimitReset, remaining,
    };
  }

  return { data: json.data, rateLimitReset, remaining };
}

// ── Listener: fetch commits + blame ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "FETCH_COMMITS_AND_BLAME") return false;

  (async () => {
    try {
      const token = await getToken();

      // REST: up to 100 commits that touched this file
      const commitsUrl =
        `https://api.github.com/repos/${msg.owner}/${msg.repo}/commits` +
        `?path=${encodeURIComponent(msg.path)}&per_page=100`;
      const commitsResult = await githubRestFetch(commitsUrl, token);

      // GraphQL: blame ranges
      // IMPORTANT: `expression` must be just the ref (e.g. "main").
      // The file path is passed separately to blame(path:).
      const blameQuery = `
        query FileBlame($owner: String!, $name: String!, $expression: String!, $path: String!) {
          repository(owner: $owner, name: $name) {
            object(expression: $expression) {
              ... on Commit {
                blame(path: $path) {
                  ranges {
                    startingLine
                    endingLine
                    commit { oid }
                  }
                }
              }
            }
          }
        }
      `;

      const blameVars = {
        owner:      msg.owner,
        name:       msg.repo,
        expression: msg.ref || "HEAD",  // use actual branch/tag/SHA from URL
        path:       msg.path,
      };

      const blameResult = await githubGraphqlFetch(blameQuery, blameVars, token);

      sendResponse({
        ok:             true,
        commits:        commitsResult.data,
        blame:          blameResult.data,
        rateLimitReset: blameResult.rateLimitReset || commitsResult.rateLimitReset,
        remaining:      blameResult.remaining      || commitsResult.remaining,
        hasPAT:         Boolean(token),
      });
    } catch (err) {
      console.error("Blame Heatmap: fetch error", err);
      sendResponse({
        ok:             false,
        error:          err.message || "Unknown error",
        status:         err.status  || 0,
        rateLimitReset: err.rateLimitReset || null,
        remaining:      err.remaining      || null,
        hasPAT:         false,
      });
    }
  })();

  return true; // keep sendResponse open for async use
});

// ── Listener: popup → content script relay ────────────────────────────────────
// Popup cannot message content scripts directly in MV3 — must go via background.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "POPUP_GET_STATS") return false;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) { sendResponse({ active: false }); return; }
    chrome.tabs.sendMessage(tabs[0].id, { type: "GET_CURRENT_HEATMAP_STATS" }, (resp) => {
      if (chrome.runtime.lastError) { sendResponse({ active: false }); return; }
      sendResponse(resp || { active: false });
    });
  });

  return true;
});
