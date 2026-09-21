/**
 * Board / Leaderboard View
 */
import { getLeaderboard } from "../services/leaderboard.js";
import { escapeHtml } from "../components/icons.js";

export async function renderBoard(container) {
  container.innerHTML = `
    <h1 class="page-title">Global Leaders</h1>
    <p class="page-subtitle">See how your focus time compares with the community.</p>
    <div class="leaderboard-header">
      <span>Rank</span>
      <span>User</span>
      <span style="text-align:right">Focus Time</span>
    </div>
    <div id="leaderboardRows" class="empty-state">Loading leaderboard...</div>
  `;

  // Trigger a sync to get fresh usage data before loading leaderboard
  chrome.runtime.sendMessage({ type: "SYNC_USAGE_NOW" }).catch(() => {
    // Sync trigger failed or not available; leaderboard will still load cached data
  });

  const rows = document.getElementById("leaderboardRows");
  try {
    const data = await getLeaderboard();
    rows.innerHTML = data.entries.length
      ? renderRows(data.entries)
      : '<div class="empty-state">No leaderboard entries yet.</div>';
  } catch (error) {
    const isApiDown = error.message.includes("not deployed") || error.message.includes("unexpected response");
    rows.innerHTML = `
      <div class="empty-state">
        <p>Could not load the leaderboard.</p>
        <p class="alert-card-desc">${isApiDown
          ? "The leaderboard service is currently unavailable. Please try again later."
          : escapeHtml(error.message)
        }</p>
        <button class="btn btn-outline" id="retryLeaderboard">Retry</button>
      </div>
    `;
    rows.querySelector("#retryLeaderboard")?.addEventListener("click", () => renderBoard(container));
  }
}

function renderRows(entries) {
  return entries
    .map(
      (e) => `
    <div class="leaderboard-row ${e.isCurrentUser ? "current-user" : ""}">
      <span class="leaderboard-rank">${e.rank}</span>
      <span class="leaderboard-user">
        ${escapeHtml(e.username)}
      </span>
      <span class="leaderboard-time">${escapeHtml(e.timeSavedFormatted)}</span>
    </div>
  `
    )
    .join("");
}
