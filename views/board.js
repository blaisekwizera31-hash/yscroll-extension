/**
 * Board / Leaderboard View
 */
import { getLeaderboard } from "../services/leaderboard.js";
import { getLocal } from "../services/storage.js";
import { escapeHtml } from "../components/icons.js";

export async function renderBoard(container, { navigate }) {
  container.innerHTML = `
    <h1 class="page-title">Global Leaders</h1>
    <p class="page-subtitle">Top users by time saved from social media.</p>
    <div id="leaderboardContent" style="margin-top:4px;">
      <div class="empty-state" style="padding:32px 0;">
        <div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--green);border-radius:50%;margin:0 auto 12px;animation:lb-spin 700ms linear infinite;"></div>
        <p>Loading leaderboard…</p>
      </div>
    </div>
    <style>
      @keyframes lb-spin { to { transform: rotate(360deg); } }
    </style>
  `;

  // Trigger a usage sync so our own stats are fresh
  chrome.runtime.sendMessage({ type: "SYNC_USAGE_NOW" }).catch(() => {});

  const content = container.querySelector("#leaderboardContent");

  // Check sign-in state first
  const { sessionToken, account = {} } = await getLocal(["sessionToken", "account"]);
  if (!sessionToken || !account.signedIn) {
    content.innerHTML = `
      <div style="text-align:center;padding:28px 16px;">
        <div style="font-size:36px;margin-bottom:12px;">🏆</div>
        <p style="font-weight:700;font-size:15px;margin-bottom:6px;">Sign in to compete</p>
        <p style="font-size:13px;color:var(--gray);margin-bottom:20px;">
          Create an account to appear on the global leaderboard and track your rank against the community.
        </p>
        <button class="btn btn-green" id="goSignInBtn" style="width:100%;">Sign In</button>
      </div>
    `;
    content.querySelector("#goSignInBtn")?.addEventListener("click", () => navigate("account"));
    return;
  }

  try {
    const data = await getLeaderboard();
    if (!data.entries.length) {
      content.innerHTML = `<div class="empty-state"><p>No leaderboard entries yet.</p><p style="font-size:12px;color:var(--gray);margin-top:4px;">Be the first — keep your shield active!</p></div>`;
      return;
    }

    // Find current user's entry so we can highlight + pin if off-screen
    const currentUserEntry = data.entries.find((e) => e.isCurrentUser);

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px 8px;">
        <span style="font-size:11px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:0.04em;">
          ${data.entries.length} users ranked
        </span>
        <span style="font-size:11px;color:var(--gray);">Time saved</span>
      </div>
      <div id="lbRows"></div>
      ${currentUserEntry && currentUserEntry.rank > 10
        ? `<div style="height:1px;background:var(--border-light);margin:8px 0;"></div>
           <p style="font-size:11px;color:var(--gray);text-align:center;margin-bottom:6px;">Your ranking</p>
           <div id="lbCurrentUserRow"></div>`
        : ""}
    `;

    const rowsEl = content.querySelector("#lbRows");
    rowsEl.innerHTML = data.entries.slice(0, 10).map(renderRow).join("");

    // Pin the current user below the list if they're outside the top 10
    if (currentUserEntry && currentUserEntry.rank > 10) {
      content.querySelector("#lbCurrentUserRow").innerHTML = renderRow(currentUserEntry);
    }

  } catch (error) {
    const isApiDown =
      error.message.includes("not deployed") ||
      error.message.includes("unexpected response") ||
      error.message.includes("unavailable");
    content.innerHTML = `
      <div class="empty-state" style="padding:24px 0;">
        <p style="font-weight:600;margin-bottom:6px;">Couldn't load the leaderboard</p>
        <p class="alert-card-desc" style="margin-bottom:16px;">${
          isApiDown
            ? "The leaderboard service is temporarily unavailable."
            : escapeHtml(error.message)
        }</p>
        <button class="btn btn-outline" id="retryLeaderboard">Retry</button>
      </div>
    `;
    content.querySelector("#retryLeaderboard")?.addEventListener("click", () =>
      renderBoard(container, { navigate })
    );
  }
}

function rankMedal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `<span style="font-size:13px;font-weight:700;color:var(--gray);">${rank}</span>`;
}

function avatarInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function renderRow(e) {
  const isTop3 = e.rank <= 3;
  const highlight = e.isCurrentUser
    ? "background:var(--green-light);border-color:var(--green);"
    : isTop3
    ? "background:#fffbea;border-color:#f59e0b22;"
    : "";

  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border-light);border-radius:14px;margin-bottom:7px;${highlight}">
      <div style="width:28px;text-align:center;flex-shrink:0;">
        ${rankMedal(e.rank)}
      </div>
      <div style="width:36px;height:36px;border-radius:50%;background:${e.isCurrentUser ? "var(--green)" : "var(--border)"};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:${e.isCurrentUser ? "#fff" : "var(--dark)"};">
        ${avatarInitials(e.username)}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(e.username)}${e.isCurrentUser ? ' <span style="font-size:10px;color:var(--green);font-weight:700;">(you)</span>' : ""}
        </div>
      </div>
      <div style="font-size:14px;font-weight:700;color:${e.isCurrentUser ? "var(--green)" : "var(--dark)"};font-variant-numeric:tabular-nums;flex-shrink:0;">
        ${escapeHtml(e.timeSavedFormatted)}
      </div>
    </div>
  `;
}
