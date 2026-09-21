/**
 * Doomshield Background Service Worker
 * Handles time tracking, storage, badge updates, alerts, and blocked sites.
 */
importScripts("services/storage-bg.js", "services/alerts-bg.js", "services/stats-bg.js");

const TRACKING_INTERVAL = 10000;
const FOCUS_SAMPLE_INTERVAL = 10000;
const MAX_FOCUS_SAMPLE_SECONDS = 30;
const USAGE_SYNC_INTERVAL = 30000;
const activeTabs = new Map();
const blockedTabs = new Set();
const BLOCKED_SITE_RULE_ID_START = 10000;
const BLOCKED_SITE_RULE_ID_END = 19999;
const BLOCKED_PAGE_PATH = "/blocked.html";
let focusTrackingActive = false;
let lastFocusSampleAt = null;
// In-memory mirror of the blocked-site state so navigation checks are
// synchronous (no await-before-block race). Refreshed on install/startup
// and whenever blockedSites/isActive changes in storage.
let blockedStateCache = { isActive: true, domains: [] };
// DNR support is a stable capability of the browser, unlike a runtime flag:
// when present, dynamic rules own blocking and the webNavigation fallback must
// never fire — even after the MV3 service worker is killed and restarted.
const dnrSupported = typeof chrome.declarativeNetRequest?.updateDynamicRules === "function";

async function refreshBlockedStateCache() {
  try {
    blockedStateCache = await getBlockedSiteState();
  } catch (_) {
    // Keep previous cache on failure rather than unblocking everything.
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Doomshield installed");
  await ensureDefaults();

  const data = await getLocal(["setupComplete", "isActive"]);

  if (!data.setupComplete && details.reason === "install") {
    await setLocal({
      dailyLimit: 30,
      sessionLimit: 5,
      coolDown: 5,
      isActive: true,
      platforms: {
        youtube: true,
        tiktok: true,
        linkedin: true,
        instagram: true,
        facebook: true,
        x: true,
      },
      usage: {
        today: 0,
        lastReset: new Date().toDateString(),
        sessions: [],
      },
      setupComplete: true,
    });
    updateBadge();
    chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
  } else if (!data.setupComplete) {
    await setLocal({
      dailyLimit: 30,
      sessionLimit: 5,
      coolDown: 5,
      isActive: true,
      platforms: {
        youtube: true,
        tiktok: true,
        linkedin: true,
        instagram: true,
        facebook: true,
        x: true,
      },
      usage: {
        today: 0,
        lastReset: new Date().toDateString(),
        sessions: [],
      },
      setupComplete: true,
    });
    updateBadge();
  } else if (data.isActive === undefined) {
    await setLocal({ isActive: true });
    updateBadge();
  }

  await syncBlockedSiteBlocking();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await syncBlockedSiteBlocking();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRACK_TIME") {
    if (!blockedTabs.has(sender.tab?.id)) {
      handleTimeTracking(
        sender.tab.id,
        message.platform,
        message.url,
        message.isActive || false,
        message.videoPlaying
      );
    }
  } else if (message.type === "TRACK_SESSION_TIME") {
    handleSessionTimeTracking(
      sender.tab.id,
      message.platform,
      message.sessionTime
    );
  } else if (message.type === "CONTENT_BLOCKED") {
    blockedTabs.add(sender.tab.id);
    if (activeTabs.has(sender.tab.id)) {
      const tabData = activeTabs.get(sender.tab.id);
      tabData.isTracking = false;
      activeTabs.set(sender.tab.id, tabData);
    }
    handleBlockEvent(message.platform, message.reason || "limit");
  } else if (message.type === "CONTENT_UNBLOCKED") {
    blockedTabs.delete(sender.tab.id);
  } else if (message.type === "REGISTER_BLOCKED_SITES") {
    syncBlockedSiteBlocking().then(() => sendResponse({ ok: true }));
    return true;
  } else if (message.type === "FOCUS_SESSION_COMPLETE") {
    recordFocusSessionComplete(message.durationMinutes).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  } else if (message.type === "SYNC_USAGE_NOW") {
    syncUsageToApi().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const allowedOrigins = ["https://doomshield.pages.dev", "https://doomshield.blaisekwizera31.workers.dev"];
  if (sender.url && !allowedOrigins.includes(new URL(sender.url).origin)) {
    return;
  }

  if (message.type !== "DOOMSHIELD_AUTH_SUCCESS" || !message.user?.email) {
    sendResponse({ ok: false, error: "Invalid authentication message." });
    return;
  }

  setLocal({
    account: {
      signedIn: true,
      email: message.user.email,
      plan: "Local Account",
      provider: "google-web",
    },
  }).then(() => sendResponse({ ok: true }));
  return true;
});

let usageCache = {
  today: 0,
  lastReset: new Date().toDateString(),
  sessions: [],
};

function resetUsageCacheIfNeeded() {
  const today = new Date().toDateString();
  if (usageCache.lastReset !== today) {
    usageCache = { today: 0, lastReset: today, sessions: [] };
    chrome.storage.local.set({ usage: usageCache });
  }
  return usageCache;
}

chrome.storage.local.get(["usage"], (data) => {
  if (data.usage) {
    usageCache = data.usage;
    resetUsageCacheIfNeeded();
  }
});

setInterval(() => {
  chrome.storage.local.set({ usage: usageCache });
}, 5000);

async function sampleFocusedTime() {
  const now = Date.now();

  if (focusTrackingActive && lastFocusSampleAt) {
    const elapsedSeconds = (now - lastFocusSampleAt) / 1000;
    if (elapsedSeconds > 0 && elapsedSeconds <= MAX_FOCUS_SAMPLE_SECONDS) {
      await recordFocusedTime(elapsedSeconds / 60);
    }
  }

  focusTrackingActive = false;
  lastFocusSampleAt = now;

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const idleState = await chrome.idle.queryState(60);
    const settings = await getLocal(["isActive", "platforms"]);
    const hasEnabledPlatform = Object.values(settings.platforms || {}).some(Boolean);

    if (
      settings.isActive !== false &&
      hasEnabledPlatform &&
      idleState === "active" &&
      tab?.url &&
      !isEnabledSocialUrl(tab.url, settings.platforms)
    ) {
      focusTrackingActive = true;
    }
  } catch (_) {
    focusTrackingActive = false;
  }
}

let usageSyncInProgress = false;

async function syncUsageToApi() {
  if (usageSyncInProgress) return;
  usageSyncInProgress = true;
  try {
    const { sessionToken, account = {}, stats = {}, usage = {} } = await getLocal(["sessionToken", "account", "stats", "usage"]);
    if (!sessionToken || !account.id) return;

    const focusedToday = stats.focusedTimeToday || 0;
    const scrolledToday = usage.today || 0;
    const focusedDelta = Math.max(0, focusedToday - (stats.syncedFocusedTimeToday || 0));
    const scrolledDelta = Math.max(0, scrolledToday - (stats.syncedScrolledTimeToday || 0));
    if (focusedDelta <= 0 && scrolledDelta <= 0) return;

    const response = await fetch("https://doomshield.blaisekwizera31.workers.dev/api/usage/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        user_id: account.id,
        time_saved_seconds: Math.round(focusedDelta * 60),
        time_scrolled_seconds: Math.round(scrolledDelta * 60),
      }),
    });
    if (!response.ok) throw new Error(`Usage sync failed (${response.status}).`);

    await setLocal({
      stats: {
        ...stats,
        syncedFocusedTimeToday: focusedToday,
        syncedScrolledTimeToday: scrolledToday,
      },
    });
  } catch (error) {
    console.warn("Doomshield usage sync unavailable:", error);
  } finally {
    usageSyncInProgress = false;
  }
}

function isEnabledSocialUrl(url, platforms) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const platformDomains = {
      youtube: ["youtube.com"],
      tiktok: ["tiktok.com"],
      linkedin: ["linkedin.com"],
      instagram: ["instagram.com"],
      facebook: ["facebook.com"],
      x: ["x.com", "twitter.com"],
    };
    return Object.entries(platformDomains).some(
      ([platform, domains]) =>
        platforms[platform] && domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    );
  } catch (_) {
    return false;
  }
}

setInterval(sampleFocusedTime, FOCUS_SAMPLE_INTERVAL);
sampleFocusedTime();
setInterval(syncUsageToApi, USAGE_SYNC_INTERVAL);

async function handleTimeTracking(tabId, platform, url, isActive, videoPlaying) {
  if (blockedTabs.has(tabId)) return;

  const settings = await getLocal(["isActive", "platforms", "dailyLimit"]);
  if (!settings.isActive || !settings.platforms || !settings.platforms[platform]) {
    finalizeTabTracking(tabId, settings.dailyLimit || 30);
    return;
  }

  const dailyLimit = settings.dailyLimit || 30;
  const now = Date.now();

  resetUsageCacheIfNeeded();

  if (!isActive || (videoPlaying !== undefined && !videoPlaying)) {
    if (activeTabs.has(tabId)) {
      const tabData = activeTabs.get(tabId);
      if (tabData.isTracking) {
        const elapsed = (now - tabData.lastUpdate) / 1000 / 60;
        if (elapsed > 0) {
          usageCache.today = Math.min(usageCache.today + elapsed, dailyLimit);
        }
        tabData.isTracking = false;
      }
      tabData.lastUpdate = now;
      activeTabs.set(tabId, tabData);
    }
    return;
  }

  if (!activeTabs.has(tabId)) {
    activeTabs.set(tabId, {
      platform,
      startTime: now,
      lastUpdate: now,
      isTracking: true,
    });
    return;
  }

  const tabData = activeTabs.get(tabId);
  if (tabData.isTracking) {
    const elapsed = (now - tabData.lastUpdate) / 1000 / 60;
    usageCache.today = Math.min(usageCache.today + elapsed, dailyLimit);
  }

  tabData.lastUpdate = now;
  tabData.isTracking = true;
  activeTabs.set(tabId, tabData);

  checkUsageWarning(usageCache.today, dailyLimit);
}

function finalizeTabTracking(tabId, dailyLimit) {
  const tabData = activeTabs.get(tabId);
  if (!tabData || !tabData.isTracking) return;

  resetUsageCacheIfNeeded();
  const elapsed = (Date.now() - tabData.lastUpdate) / 1000 / 60;
  if (elapsed > 0) {
    usageCache.today = Math.min(usageCache.today + elapsed, dailyLimit);
  }
  tabData.lastUpdate = Date.now();
  tabData.isTracking = false;
  activeTabs.set(tabId, tabData);
}

async function handleSessionTimeTracking(tabId, platform, sessionTime) {
  const settings = await getLocal(["isActive", "platforms", "dailyLimit", "sessionLimit"]);
  if (!settings.isActive) return;
  if (!settings.platforms || !settings.platforms[platform]) return;

  // TRACK_TIME is authoritative. Content scripts may send this message when
  // their local session limit fires, so only finalize the unsampled tail here.
  const dailyLimit = settings.dailyLimit || 30;
  resetUsageCacheIfNeeded();

  if (activeTabs.has(tabId)) {
    const tabData = activeTabs.get(tabId);
    if (tabData.isTracking) {
      const elapsed = (Date.now() - tabData.lastUpdate) / 1000 / 60;
      if (elapsed > 0) {
        usageCache.today = Math.min(usageCache.today + elapsed, dailyLimit);
      }
    }
    tabData.lastUpdate = Date.now();
    tabData.isTracking = false;
    activeTabs.set(tabId, tabData);
  }

  await setLocal({ usage: usageCache });
}

async function handleBlockEvent(platform, reason) {
  const settings = await getLocal(["sessionLimit", "dailyLimit", "notificationSettings"]);
  const estimated = settings.sessionLimit || 5;
  await recordBlockEvent(estimated);

  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
  await addAlert({
    type: "block",
    title: "Social Media Shielded",
    description: `${platformName} access was blocked by your shield.`,
    platform,
    dedupeKey: `block-${platform}-${reason}-${Math.floor(Date.now() / 60000)}`,
  });

  if (reason === "daily") {
    await addAlert({
      type: "warning",
      title: "Daily Limit Reached",
      description: `You've hit your ${settings.dailyLimit || 30} minute daily limit.`,
      dedupeKey: `daily-limit-${new Date().toDateString()}`,
    });
  }

}

let lastWarningThreshold = -1;

async function checkUsageWarning(usageToday, dailyLimit) {
  const ratio = usageToday / dailyLimit;
  let threshold = -1;
  if (ratio >= 1) threshold = 100;
  else if (ratio >= 0.8) threshold = 80;

  if (threshold > 0 && threshold !== lastWarningThreshold) {
    lastWarningThreshold = threshold;
    const { notificationSettings = {} } = await getLocal(["notificationSettings"]);
    if (notificationSettings.usageAlerts !== false) {
      await addAlert({
        type: "warning",
        title: threshold >= 100 ? "Limit Reached" : "Approaching Limit",
        description:
          threshold >= 100
            ? "Your daily doomscroll limit has been reached."
            : `You're at ${Math.round(ratio * 100)}% of your daily limit.`,
        dedupeKey: `warning-${threshold}-${new Date().toDateString()}`,
      });
    }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
  blockedTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const isTrackedUrl =
      changeInfo.url.includes("youtube.com/shorts") ||
      changeInfo.url.includes("youtube.com/watch") ||
      changeInfo.url.includes("tiktok.com") ||
      changeInfo.url.includes("linkedin.com/feed") ||
      changeInfo.url.includes("instagram.com") ||
      changeInfo.url.includes("facebook.com") ||
      changeInfo.url.includes("x.com");

    if (!isTrackedUrl) {
      activeTabs.delete(tabId);
      blockedTabs.delete(tabId);
    }
  }
});

if (chrome.webNavigation) {
  chrome.webNavigation.onCommitted.addListener(handleMaybeBlockedNavigation);
  chrome.webNavigation.onHistoryStateUpdated.addListener(handleMaybeBlockedNavigation);
}

// Prime the in-memory blocked-state cache as early as possible so early
// navigations are checked synchronously instead of racing an async storage read,
// and re-sync DNR rules on every service-worker wake (not just install/startup)
// so blocking is always enforced at the network level with no flash of content.
refreshBlockedStateCache();
syncBlockedSiteBlocking().catch((err) => {
  console.warn("Doomshield: blocked-site rule sync failed on wake:", err);
});

chrome.alarms.create("resetDaily", {
  when: getNextMidnight(),
  periodInMinutes: 1440,
});

chrome.alarms.create("weeklySummary", { periodInMinutes: 10080 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "resetDaily") {
    await setLocal({
      usage: {
        today: 0,
        lastReset: new Date().toDateString(),
        sessions: [],
      },
      stats: {
        ...(await getLocal(["stats"])).stats,
        timeSavedToday: 0,
        focusedTimeToday: 0,
        syncedFocusedTimeToday: 0,
        syncedScrolledTimeToday: 0,
        blockedAttempts: 0,
        lastStatsReset: new Date().toDateString(),
      },
    });
    usageCache = {
      today: 0,
      lastReset: new Date().toDateString(),
      sessions: [],
    };
    lastWarningThreshold = -1;
  } else if (alarm.name === "weeklySummary") {
    const { notificationSettings = {} } = await getLocal(["notificationSettings"]);
    if (notificationSettings.weeklySummary !== false) {
      await generateWeeklySummary();
      await addAlert({
        type: "summary",
        title: "Weekly Summary Ready",
        description: "Your local weekly focus report is available.",
        dedupeKey: `weekly-${new Date().toDateString()}`,
      });
    }
  } else if (alarm.name?.startsWith("focus-")) {
    const sessionId = alarm.name.replace("focus-", "");
    const { activeFocusSession } = await getLocal(["activeFocusSession"]);
    if (activeFocusSession?.id === sessionId) {
      await recordFocusSessionComplete(activeFocusSession.durationMinutes);
      await addAlert({
        type: "milestone",
        title: "Focus Session Complete",
        description: `You completed a ${activeFocusSession.durationMinutes} minute focus session.`,
        dedupeKey: `focus-${sessionId}`,
      });
      await setLocal({ activeFocusSession: null });
    }
  }
});

function getNextMidnight() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  ).getTime();
}

function displayMinutes(used) {
  return Math.ceil(used);
}

async function updateBadge() {
  const data = await getLocal(["usage", "dailyLimit", "isActive", "alerts"]);
  const hasUnreadAlert = (data.alerts || []).some((alert) => !alert.read);

  if (hasUnreadAlert) {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#087A2A" });
    return;
  }

  if (!data.isActive) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#171A18" });
    return;
  }

  const usage = data.usage || { today: 0 };
  const limit = data.dailyLimit || 30;
  const used = displayMinutes(usage.today);

  if (used >= limit) {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  } else if (used >= limit * 0.8) {
    chrome.action.setBadgeText({ text: String(used) });
    chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
  } else {
    chrome.action.setBadgeText({ text: String(used) });
    chrome.action.setBadgeBackgroundColor({ color: "#087A2A" });
  }
}

setInterval(updateBadge, 10000);
updateBadge();

function normalizeBlockedDomain(domain) {
  if (typeof domain !== "string") return null;
  const normalized = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function getBlockedSiteDomains(blockedSites = []) {
  return [...new Set(blockedSites.map(normalizeBlockedDomain).filter(Boolean))];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBlockedSiteRule(domain, index) {
  return {
    id: BLOCKED_SITE_RULE_ID_START + index,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: BLOCKED_PAGE_PATH },
    },
    condition: {
      regexFilter: `^https?://([^/]+\\.)?${escapeRegex(domain)}(?::[0-9]+)?(?:/|$)`,
      resourceTypes: ["main_frame"],
    },
  };
}

function isUrlBlockedByDomains(url, domains) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch (_) {
    return false;
  }
}

async function getBlockedSiteState() {
  const { isActive, blockedSites = [] } = await getLocal(["isActive", "blockedSites"]);
  return {
    isActive: isActive !== false,
    domains: getBlockedSiteDomains(blockedSites),
  };
}

async function removeBlockedSiteDnrRules() {
  if (!chrome.declarativeNetRequest?.getDynamicRules) return;

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((rule) => rule.id >= BLOCKED_SITE_RULE_ID_START && rule.id <= BLOCKED_SITE_RULE_ID_END)
    .map((rule) => rule.id);

  if (removeRuleIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  }
}

async function syncBlockedSiteDnrRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return false;

  const { isActive, domains } = await getBlockedSiteState();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((rule) => rule.id >= BLOCKED_SITE_RULE_ID_START && rule.id <= BLOCKED_SITE_RULE_ID_END)
    .map((rule) => rule.id);
  const addRules = isActive
    ? domains
        .slice(0, BLOCKED_SITE_RULE_ID_END - BLOCKED_SITE_RULE_ID_START + 1)
        .map(buildBlockedSiteRule)
    : [];

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  return true;
}

async function unregisterLegacyBlockedSiteScripts() {
  if (!chrome.scripting?.getRegisteredContentScripts) return;

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const blockedIds = existing
      .filter((script) => script.id.startsWith("doomshield-block-"))
      .map((script) => script.id);
    if (blockedIds.length) {
      await chrome.scripting.unregisterContentScripts({ ids: blockedIds });
    }
  } catch (_) {}
}

async function redirectMatchingBlockedTabs() {
  const { isActive, domains } = await getBlockedSiteState();
  if (!isActive || !domains.length) return;

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  } catch (_) {
    return;
  }

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || !isUrlBlockedByDomains(tab.url, domains)) return;
      try {
        await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("blocked.html") });
      } catch (_) {}
    })
  );
}

function handleMaybeBlockedNavigation(details) {
  if (details.frameId !== 0 || details.tabId < 0 || !details.url) return;
  // When declarativeNetRequest is supported its rules already stop the
  // navigation at network level; redirecting again from here causes the
  // block/unblock flicker loop. Capability check survives service-worker
  // restarts (a volatile "rules are synced" flag does not).
  if (dnrSupported) return;

  // Synchronous check against the in-memory cache — no await before blocking,
  // so the page can't render while we decide.
  const { isActive, domains } = blockedStateCache;
  if (!isActive || !domains.length || !isUrlBlockedByDomains(details.url, domains)) return;

  try {
    chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL("blocked.html") });
  } catch (_) {}
}

async function syncBlockedSiteBlocking() {
  await refreshBlockedStateCache();
  await unregisterLegacyBlockedSiteScripts();

  try {
    const usingDnr = await syncBlockedSiteDnrRules();
    if (usingDnr) {
      await redirectMatchingBlockedTabs();
      return;
    }
  } catch (err) {
    console.warn("Could not sync blocked site network rules:", err);
    await removeBlockedSiteDnrRules();
  }

  await registerBlockedSiteScripts();
  await redirectMatchingBlockedTabs();
}

async function registerBlockedSiteScripts() {
  if (!chrome.scripting?.registerContentScripts) return;

  const { isActive, domains } = await getBlockedSiteState();
  if (!isActive || !domains.length) return;

  const scripts = domains.map((domain) => ({
    id: `doomshield-block-${domain.replace(/[^a-z0-9]/gi, "-")}`,
    matches: [`*://*.${domain}/*`, `*://${domain}/*`],
    js: ["contentScripts/blockedSite.js"],
    runAt: "document_start",
  }));

  try {
    await chrome.scripting.registerContentScripts(scripts);
  } catch (err) {
    console.warn("Could not register blocked site scripts:", err);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.blockedSites || changes.isActive)) {
    syncBlockedSiteBlocking();
  }
  if (area === "local" && (changes.isActive || changes.usage)) {
    updateBadge();
  }
});

// Keep the synchronous cache fresh even for changes this listener doesn't sync
// rules for (e.g. DNR unavailable), so the fallback never blocks on stale data.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.blockedSites || changes.isActive)) {
    refreshBlockedStateCache();
  }
});
