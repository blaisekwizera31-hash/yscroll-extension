/**
 * Doomshield Leaderboard Service
 * Local abstraction — demo entries + real current-user stats.
 * Architecture allows future API replacement.
 */
import { formatHoursMinutes } from "./stats.js";
import { getLocal } from "./storage.js";
import { apiRequest } from "./api.js";

export async function getLeaderboard() {
  const { sessionToken, account = {} } = await getLocal(["sessionToken", "account"]);
  if (!sessionToken) throw new Error("Sign in to view the global leaderboard.");

  const data = await apiRequest("/api/leaderboard", {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  const currentUserId = account.id || null;

  return {
    entries: (data.entries || []).map((entry, index) => ({
      ...entry,
      rank: index + 1,
      username: entry.name || "Anonymous",
      timeSaved: (entry.time_saved_seconds || 0) / 60,
      timeSavedFormatted: formatHoursMinutes((entry.time_saved_seconds || 0) / 60),
      isCurrentUser: currentUserId ? entry.id === currentUserId : false,
    })),
    hasMore: false,
  };
}
