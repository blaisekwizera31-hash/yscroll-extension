/**
 * Stats helpers for background service worker (non-module)
 */
async function resetDailyStatsIfNeeded() {
  const { stats = {} } = await getLocal(["stats"]);
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
}

async function recordBlockEvent(estimatedMinutes = 5) {
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

async function recordFocusSessionComplete(durationMinutes) {
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

async function recordFocusedTime(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  await resetDailyStatsIfNeeded();
  const { stats = {} } = await getLocal(["stats"]);
  await setLocal({
    stats: {
      ...stats,
      focusedTimeToday: (stats.focusedTimeToday || 0) + minutes,
      focusedTimeTotal: (stats.focusedTimeTotal || 0) + minutes,
      timeSavedToday: (stats.timeSavedToday || 0) + minutes,
      timeSavedTotal: (stats.timeSavedTotal || 0) + minutes,
    },
  });
}
