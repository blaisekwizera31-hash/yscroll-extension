/**
 * Alert helpers for background service worker (non-module)
 */
const MAX_ALERTS = 100;

async function addAlert({ type, title, description, platform, dedupeKey }) {
  const { alerts = [] } = await getLocal(["alerts"]);
  const today = new Date().toDateString();

  if (dedupeKey) {
    const exists = alerts.some(
      (a) => a.dedupeKey === dedupeKey && new Date(a.timestamp).toDateString() === today
    );
    if (exists) return null;
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    description,
    timestamp: Date.now(),
    read: false,
    platform: platform || null,
    dedupeKey: dedupeKey || null,
  };

  const updated = [entry, ...alerts].slice(0, MAX_ALERTS);
  await setLocal({ alerts: updated });
  const { notificationSettings = {} } = await getLocal(["notificationSettings"]);
  if (notificationSettings.usageAlerts !== false || type !== "warning") {
    createNotification(entry.id, title, description);
  }
  chrome.action?.setBadgeText?.({ text: "!" });
  chrome.action?.setBadgeBackgroundColor?.({ color: "#087A2A" });
  return entry;
}

function createNotification(id, title, message) {
  if (!chrome.notifications?.create) return;
  try {
    chrome.notifications.create(`alert-${id}`, {
      type: "basic",
      title: `Doomshield: ${title}`,
      message,
      iconUrl: chrome.runtime.getURL("icons/doomshield-128.png"),
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Doomshield notification unavailable:", chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.warn("Doomshield notification unavailable:", error);
  }
}

async function generateWeeklySummary() {
  const { stats = {}, usage = {} } = await getLocal(["stats", "usage"]);
  const summary = {
    generatedAt: Date.now(),
    totalUsage: usage.today || 0,
    timeSaved: stats.timeSavedToday || 0,
    blockedAttempts: stats.blockedAttempts || 0,
    hasEnoughData: (stats.blockedAttempts || 0) > 0 || (usage.today || 0) > 0,
  };
  await setLocal({ weeklySummary: summary });
  return summary;
}
