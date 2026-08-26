/**
 * Instagram Reels and Feed Content Blocker
 * Monitors and limits time spent on Instagram Reels and feed
 */
(function () {
  "use strict";

  let sessionStart = null;
  let isBlocked = false;
  let cooldownEnd = null;
  let trackingIntervalId = null;
  let lastActiveTimestamp = null;
  const PLATFORM = "instagram";

  function isContextValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  }

  function isReelsOrFeed() {
    const path = window.location.pathname;
    return path === "/" || path.includes("/reels/");
  }

  /**
   * Creates a blocking overlay with message and home button
   */
  async function createBlockOverlay(message) {
    return DoomshieldShared.createBlockOverlay(message, PLATFORM, "https://www.instagram.com/", cooldownEnd);
    const overlay = document.createElement("div");
    overlay.id = DoomshieldShared.OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #171A18;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: "Outfit", ui-sans-serif, system-ui, sans-serif;
    `;

    const logoUrl = chrome.runtime.getURL("icons/doomshield-128.png");
    overlay.innerHTML = `
      <div style="text-align: center; max-width: 500px; padding: 40px;">
        <div class="go-home-btn" style="margin-bottom: 20px;">
          <a href="https://www.instagram.com/" target="_blank" style="display: inline-block; padding: 12px 24px; background: #087A2A; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background 0.2s;">
            Go to Homepage
          </a>
        </div>
        <div style="width: 80px; height: 80px; background: white; border-radius: 20px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
          <img src="${logoUrl}" alt="Doomshield" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        <h1 style="font-size: 36px; margin-bottom: 16px; color: white;">Doomshield active</h1>
        <p style="font-size: 18px; color: #cbd5e0; margin-bottom: 24px;">${message}</p>
        <p style="font-size: 14px; color: #b9c8bd;">Your focus is protected.</p>
      </div>
    `;

    const settings = await chrome.storage.local.get(["strictMode"]);
    if (settings.strictMode) overlay.querySelector(".go-home-btn")?.remove();

    overlay.addEventListener("keydown", (e) => e.stopPropagation(), true);
    overlay.addEventListener("keyup", (e) => e.stopPropagation(), true);
    overlay.addEventListener("keypress", (e) => e.stopPropagation(), true);
    overlay.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { passive: false, capture: true }
    );
    overlay.addEventListener(
      "scroll",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { passive: false, capture: true }
    );

    return overlay;
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

    if (!data.platforms || data.platforms.instagram === false) {
      removeBlockOverlay();
      return;
    }

    if (!isReelsOrFeed()) {
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
   * Shows blocking overlay and pauses all videos
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
      platform: "instagram",
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
          platform: "instagram",
        });
      }
    }
  }

  function isVideoPlaying() {
    const videos = document.querySelectorAll("video");
    if (videos.length === 0) return false;

    for (const video of videos) {
      if (!video.paused && !video.ended && video.readyState > 2) {
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

    if (!isReelsOrFeed()) {
      return false;
    }

    if (document.visibilityState !== "visible") {
      return false;
    }

    return true;
  }

  /**
   * Tracks time spent on Reels/Feed
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
    if (!data.platforms || data.platforms.instagram === false) {
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

    const playing = isVideoPlaying();
    console.log(`[Doomshield] Instagram, Track: ${shouldTrack}, Video: ${playing}`);

    if (!isContextValid()) return;
    chrome.runtime.sendMessage({
      type: "TRACK_TIME",
      platform: "instagram",
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


  // Monitor URL changes (Instagram is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (!isReelsOrFeed()) {
        sessionStart = null;
        saveSessionState();
      }
      checkAndBlock();
    }
  }).observe(document, { subtree: true, childList: true });
})();
