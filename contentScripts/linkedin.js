/**
 * LinkedIn Feed Content Blocker
 * Monitors and limits time spent on LinkedIn feed
 */
(function () {
  "use strict";

  let sessionStart = null;
  let isBlocked = false;
  let cooldownEnd = null;
  let trackingIntervalId = null;
  let lastActiveTimestamp = null;
  const PLATFORM = "linkedin";

  function isContextValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  }

  function isFeedPage() {
    return (
      window.location.pathname === "/feed/" || window.location.pathname === "/"
    );
  }

  /**
   * Creates a blocking overlay with message and home button
   */
  async function createBlockOverlay(message) {
    return DoomshieldShared.createBlockOverlay(message, PLATFORM, "https://www.linkedin.com/feed/", cooldownEnd);
  }

  async function loadSessionState() {
    if (!isContextValid()) return;
    const data = await chrome.storage.local.get(["sessionState"]);
    const sessionState = data.sessionState || {};
    const platformState = sessionState[PLATFORM] || {};

    if (platformState.cooldownEnd) {
      cooldownEnd = platformState.cooldownEnd;
    }
  }

  async function saveSessionState() {
    if (!isContextValid()) return;
    const data = await chrome.storage.local.get(["sessionState"]);
    const sessionState = data.sessionState || {};
    sessionState[PLATFORM] = {
      sessionStart: sessionStart,
      cooldownEnd: cooldownEnd,
    };
    await chrome.storage.local.set({ sessionState });
  }

  /**
   * Checks limits and blocks content if necessary
   */
  async function checkAndBlock() {
    if (!isContextValid()) return;
    await loadSessionState();

    const data = await chrome.storage.local.get([
      "isActive",
      "platforms",
      "dailyLimit",
      "sessionLimit",
      "coolDown",
      "usage",
    ]);

    if (data.isActive === false) {
      removeBlockOverlay();
      return;
    }

    if (!data.platforms || data.platforms.linkedin === false) {
      removeBlockOverlay();
      return;
    }

    if (!isFeedPage()) {
      removeBlockOverlay();
      sessionStart = null;
      await saveSessionState();
      return;
    }

    const usage = DoomshieldShared.getUsageForToday(data.usage);
    const dailyLimit = data.dailyLimit || 30;
    const sessionLimit = data.sessionLimit || 5;
    const coolDown = data.coolDown || 5;

    if (DoomshieldShared.isDailyLimitReached(usage, dailyLimit)) {
      const hadCooldown = Boolean(cooldownEnd);
      cooldownEnd = null;
      sessionStart = null;
      lastActiveTimestamp = null;
      await saveSessionState();
      if (hadCooldown) removeBlockOverlay();
      showBlockOverlay(
        DoomshieldShared.dailyLimitReachedMessage(dailyLimit),
        "daily"
      );
      return;
    }

    if (cooldownEnd && Date.now() < cooldownEnd) {
      const remainingMinutes = Math.ceil(
        (cooldownEnd - Date.now()) / 1000 / 60
      );
      showBlockOverlay(
        `Session limit reached. Cool down for ${remainingMinutes} more minute${remainingMinutes !== 1 ? "s" : ""
        }.`
      );
      lastActiveTimestamp = null;
      return;
    } else if (cooldownEnd && Date.now() >= cooldownEnd) {
      cooldownEnd = null;
      sessionStart = null;
      lastActiveTimestamp = null;
      await saveSessionState();
      removeBlockOverlay();
      return;
    }

    if (!sessionStart) return;
    const sessionTime = (Date.now() - sessionStart) / 1000 / 60;

    if (sessionTime >= sessionLimit) {
      if (!cooldownEnd) {
        cooldownEnd = Date.now() + coolDown * 60 * 1000;
        await saveSessionState();
        lastActiveTimestamp = null;

        chrome.runtime.sendMessage({
          type: "TRACK_SESSION_TIME",
          platform: PLATFORM,
          sessionTime: Math.min(sessionTime, sessionLimit),
        });
      }
      const remainingMinutes = Math.ceil(
        (cooldownEnd - Date.now()) / 1000 / 60
      );
      if (remainingMinutes > 0) {
        showBlockOverlay(
          `Session limit reached. Cool down for ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""
          }.`
        );
      }
      return;
    }

    removeBlockOverlay();
  }

  /**
   * Shows blocking overlay
   */
  async function showBlockOverlay(message, reason = "session") {
    if (isBlocked) return;

    const existing = document.getElementById(DoomshieldShared.OVERLAY_ID);
    if (existing) existing.remove();

    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      video.pause();
      video.muted = true;
      video.currentTime = 0;
    });

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const overlay = await createBlockOverlay(message);
    document.body.appendChild(overlay);
    isBlocked = true;

    chrome.runtime.sendMessage({
      type: "CONTENT_BLOCKED",
      platform: "linkedin",
      reason,
    });

    const blockInterval = setInterval(() => {
      if (!isBlocked) {
        clearInterval(blockInterval);
        return;
      }
      const videos = document.querySelectorAll("video");
      videos.forEach((video) => {
        if (!video.paused) {
          video.pause();
          video.muted = true;
          video.currentTime = 0;
        }
      });
    }, 500);
  }

  function removeBlockOverlay() {
    const overlay = document.getElementById(DoomshieldShared.OVERLAY_ID);
    if (overlay) {
      overlay.remove();
      const wasBlocked = isBlocked;
      isBlocked = false;

      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";

      if (wasBlocked) {
        chrome.runtime.sendMessage({
          type: "CONTENT_UNBLOCKED",
          platform: "linkedin",
        });
      }
    }
  }

  function isVideoPlaying() {
    const videos = document.querySelectorAll("video");
    if (videos.length === 0) return false;

    for (const video of videos) {
      if (!video.paused && !video.ended && video.readyState > 2) {
        // Check if video is somewhat visible in viewport
        const rect = video.getBoundingClientRect();
        const isVisible = (
          rect.top >= -rect.height &&
          rect.left >= -rect.width &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + rect.height &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth) + rect.width
        );
        if (isVisible) return true;
      }
    }
    return false;
  }

  /**
   * Determines if time tracking should occur
   */
  function shouldTrackTime() {
    if (isBlocked || (cooldownEnd && Date.now() < cooldownEnd)) {
      return false;
    }

    if (!isFeedPage()) {
      return false;
    }

    if (document.visibilityState !== "visible") {
      return false;
    }

    return true;
  }

  /**
   * Tracks time spent on feed
   */
  async function trackTime() {
    const shouldTrack = shouldTrackTime();

    if (!shouldTrack) {
      if (lastActiveTimestamp !== null) {
        lastActiveTimestamp = null;
      }
      return;
    }

    const data = await chrome.storage.local.get(["isActive", "platforms", "dailyLimit", "usage"]);
    if (data.isActive === false) {
      return;
    }
    if (!data.platforms || data.platforms.linkedin === false) {
      return;
    }

    const dailyLimit = data.dailyLimit || 30;
    if (DoomshieldShared.isDailyLimitReached(data.usage, dailyLimit)) {
      sessionStart = null;
      cooldownEnd = null;
      lastActiveTimestamp = null;
      await saveSessionState();
      showBlockOverlay(DoomshieldShared.dailyLimitReachedMessage(dailyLimit), "daily");
      return;
    }

    if (!sessionStart) {
      sessionStart = Date.now();
      await saveSessionState();
    }

    if (!isContextValid()) return;
    chrome.runtime.sendMessage({
      type: "TRACK_TIME",
      platform: "linkedin",
      url: window.location.href,
      isActive: document.visibilityState === "visible",
      videoPlaying: true,
    });
  }

  // Initialize
  loadSessionState().then(() => {
    checkAndBlock();
  });

  setInterval(checkAndBlock, 2000);
  window.addEventListener("doomshield-cooldown-complete", checkAndBlock);

  if (trackingIntervalId) {
    clearInterval(trackingIntervalId);
  }
  trackingIntervalId = setInterval(trackTime, 1000);


  // Monitor URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (!isFeedPage()) {
        sessionStart = null;
        saveSessionState();
      }
      checkAndBlock();
    }
  }).observe(document, { subtree: true, childList: true });
})();
