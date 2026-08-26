/**
 * Storage helpers for background service worker (non-module)
 */
const STORAGE_DEFAULTS = {
  dailyLimit: 30,
  sessionLimit: 5,
  coolDown: 5,
  isActive: true,
  setupComplete: false,
  platforms: {
    youtube: true,
    tiktok: true,
    linkedin: true,
    instagram: true,
    facebook: true,
    x: true,
  },
  usage: { today: 0, lastReset: new Date().toDateString(), sessions: [] },
  alerts: [],
  blockedSites: [],
  focusDurations: [30, 60],
  activeFocusSession: null,
  notificationSettings: { usageAlerts: true, weeklySummary: true },
  strictMode: false,
  stats: {
    timeSavedToday: 0,
    timeSavedTotal: 0,
    focusedTimeToday: 0,
    focusedTimeTotal: 0,
    syncedFocusedTimeToday: 0,
    syncedScrolledTimeToday: 0,
    blockedAttempts: 0,
    focusScore: 0,
    lastStatsReset: new Date().toDateString(),
  },
  account: { signedIn: false, email: null, plan: "Local" },
  weeklySummary: null,
};

function getLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setLocal(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function ensureDefaults() {
  const data = await getLocal(Object.keys(STORAGE_DEFAULTS));
  const patch = {};
  for (const [key, value] of Object.entries(STORAGE_DEFAULTS)) {
    if (data[key] === undefined) patch[key] = value;
  }
  if (Object.keys(patch).length) await setLocal(patch);
}
