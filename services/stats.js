/**
 * Doomshield Statistics
 *
 * Time Saved calculation:
 * - timeSavedToday increments when Doomshield actively blocks content
 *   (estimated minutes prevented per block event).
 * - protectedTimeRemaining = max(0, dailyLimit - usage.today) — minutes still
 *   under your daily limit (shown as contextual info, not claimed as "saved").
 *
 * Focus Score (0–100 local heuristic):
 * - Points for staying under daily limit, blocks prevented, focus sessions.
 */
import { getLocal, setLocal } from "./storage.js";

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatHoursMinutes(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export async function resetDailyStatsIfNeeded() {
  const { stats = {}, usage = {} } = await getLocal(["stats", "usage"]);
  const today = new Date().toDateString();
  if (stats.lastStatsReset !== today) {
    await setLocal({
      stats: {
        ...stats,
        timeSavedToday: 0,
        focusedTimeToday: 0,
        syncedFocusedTimeToday: 0,
        syncedScrolledTimeToday: 0,
        blockedAttempts: 0,
        lastStatsReset: today,
      },
    });
  }
  if (usage.lastReset !== today) {
    await setLocal({
      usage: { today: 0, lastReset: today, sessions: [] },
    });
  }
}

/**
 * Record a block event — increments time saved estimate.
 * @param {number} estimatedMinutes - minutes prevented (defaults to sessionLimit)
 */
export async function recordBlockEvent(estimatedMinutes = 5) {
  await resetDailyStatsIfNeeded();
  const { stats = {} } = await getLocal(["stats"]);
  const updated = {
    ...stats,
    timeSavedToday: (stats.timeSavedToday || 0) + estimatedMinutes,
    timeSavedTotal: (stats.timeSavedTotal || 0) + estimatedMinutes,
    blockedAttempts: (stats.blockedAttempts || 0) + 1,
  };
  await setLocal({ stats: updated });
  return updated;
}

export async function recordFocusSessionComplete(durationMinutes) {
  await resetDailyStatsIfNeeded();
  const { stats = {} } = await getLocal(["stats"]);
  const bonus = Math.round(durationMinutes * 0.5);
  const updated = {
    ...stats,
    timeSavedToday: (stats.timeSavedToday || 0) + bonus,
    timeSavedTotal: (stats.timeSavedTotal || 0) + bonus,
  };
  await setLocal({ stats: updated });
  return updated;
}

export async function getDashboardStats() {
  await resetDailyStatsIfNeeded();
  const data = await getLocal(["stats", "usage", "dailyLimit", "isActive", "platforms"]);
  const dailyLimit = data.dailyLimit || 30;
  const usageToday = data.usage?.today || 0;
  const stats = data.stats || {};
  const protectedRemaining = Math.max(0, dailyLimit - usageToday);
  const limitReached = usageToday >= dailyLimit;

  const platforms = data.platforms || {};
  const anyPlatformOn = Object.values(platforms).some(Boolean);

  let shieldStatus = "Active";
  if (!data.isActive) shieldStatus = "Paused";
  else if (!anyPlatformOn) shieldStatus = "Disabled";
  else if (limitReached) shieldStatus = "Limit Reached";

  const focusScore = calculateFocusScore({
    usageToday,
    dailyLimit,
    blockedAttempts: stats.blockedAttempts || 0,
    timeSavedToday: stats.timeSavedToday || 0,
    isActive: data.isActive !== false,
  });

  return {
    timeSavedToday: stats.timeSavedToday || 0,
    timeSavedTotal: stats.timeSavedTotal || 0,
    focusedTimeToday: stats.focusedTimeToday || 0,
    focusedTimeTotal: stats.focusedTimeTotal || 0,
    protectedRemaining,
    usageToday,
    dailyLimit,
    limitReached,
    shieldStatus,
    focusScore,
    blockedAttempts: stats.blockedAttempts || 0,
    isActive: data.isActive !== false,
  };
}

function calculateFocusScore({ usageToday, dailyLimit, blockedAttempts, timeSavedToday, isActive }) {
  if (!isActive) return Math.max(0, 50 - Math.round(usageToday));
  let score = 50;
  const usageRatio = dailyLimit > 0 ? usageToday / dailyLimit : 0;
  if (usageRatio < 0.5) score += 25;
  else if (usageRatio < 0.8) score += 10;
  else if (usageRatio >= 1) score -= 20;
  score += Math.min(15, blockedAttempts * 3);
  score += Math.min(10, Math.floor(timeSavedToday / 30));
  return Math.max(0, Math.min(100, score));
}

export async function generateWeeklySummary() {
  const { stats = {}, usage = {}, weeklySummary } = await getLocal([
    "stats",
    "usage",
    "weeklySummary",
    "alerts",
  ]);

  const summary = {
    generatedAt: Date.now(),
    totalUsage: usage.today || 0,
    timeSaved: stats.timeSavedToday || 0,
    blockedAttempts: stats.blockedAttempts || 0,
    focusScore: calculateFocusScore({
      usageToday: usage.today || 0,
      dailyLimit: 30,
      blockedAttempts: stats.blockedAttempts || 0,
      timeSavedToday: stats.timeSavedToday || 0,
      isActive: true,
    }),
    hasEnoughData: (stats.blockedAttempts || 0) > 0 || (usage.today || 0) > 0,
  };

  await setLocal({ weeklySummary: summary });
  return summary;
}
