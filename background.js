// background.js

// Get PAT from storage
async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["githubToken"], (res) => {
      resolve(res.githubToken || null);
    });
  });
}

// GitHub REST helper
async function githubRestFetch(url, token) {
  const headers = {
    "Accept": "application/vnd.github+json"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers
  });

  const rateLimitReset = res.headers.get("X-RateLimit-Reset");
  const remaining = res.headers.get("X-RateLimit-Remaining");

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw {
      status: res.status,
      message: body.message || "GitHub API error",
      rateLimitReset,
      remaining
    };
  }

  const data = await res.json();
  return {
    data,
    rateLimitReset,
    remaining
  };
}

// GitHub GraphQL helper (for blame)
async function githubGraphqlFetch(query, variables, token) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });

  const rateLimitReset = res.headers.get("X-RateLimit-Reset");
  const remaining = res.headers.get("X-RateLimit-Remaining");

  const json = await res.json();

  if (!res.ok || json.errors) {
    throw {
      status: res.status,
      message: (json.errors && json.errors[0] && json.errors[0].message) || "GraphQL error",
      rateLimitReset,
      remaining
    };
  }

  return {
    data: json.data,
    rateLimitReset,
    remaining
  };
}

// Message routing
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_COMMITS_AND_BLAME") {
    (async () => {
      try {
        const token = await getToken();

        // 1) Commits for this file
        const commitsUrl =
          `https://api.github.com/repos/${msg.owner}/${msg.repo}/commits?path=${encodeURIComponent(msg.path)}&per_page=100`;

        const commitsResult = await githubRestFetch(commitsUrl, token);

        // 2) Blame via GraphQL
        // Example blame shape is based on GitHub GraphQL docs. [web:8][web:11][web:14]
        const blameQuery = `
          query FileBlame($owner: String!, $name: String!, $expression: String!, $path: String!) {
            repository(owner: $owner, name: $name) {
              object(expression: $expression) {
                ... on Commit {
                  blame(path: $path) {
                    ranges {
                      startingLine
                      endingLine
                      age
                      commit {
                        oid
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const blameVars = {
          owner: msg.owner,
          name: msg.repo,
          expression: msg.ref || "HEAD",
          path: msg.path
        };

        const blameResult = await githubGraphqlFetch(blameQuery, blameVars, token);

        sendResponse({
          ok: true,
          commits: commitsResult.data,
          blame: blameResult.data,
          rateLimitReset: blameResult.rateLimitReset || commitsResult.rateLimitReset,
          remaining: blameResult.remaining || commitsResult.remaining
        });
      } catch (err) {
        console.error("GitHub fetch error", err);
        sendResponse({
          ok: false,
          error: err.message || "Unknown error",
          status: err.status || 0,
          rateLimitReset: err.rateLimitReset || null,
          remaining: err.remaining || null
        });
      }
    })();

    return true; // async response
  }

  return false;
});