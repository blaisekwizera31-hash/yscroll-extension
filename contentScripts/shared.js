/**
 * Doomshield Shared Content Script Utilities
 */
window.DoomshieldShared = {
  OVERLAY_ID: "doomshield-block-overlay",
  BRAND: "Doomshield",

  isContextValid() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  },

  async getSettings() {
    if (!this.isContextValid()) return {};
    return chrome.storage.local.get([
      "isActive", "platforms", "dailyLimit", "sessionLimit", "coolDown", "usage", "strictMode",
      "stats",
    ]);
  },

  getUsageForToday(usage = {}) {
    const today = new Date().toDateString();
    if (usage.lastReset !== today) {
      return { today: 0, lastReset: today, sessions: [] };
    }

    return {
      today: usage.today || 0,
      lastReset: usage.lastReset,
      sessions: Array.isArray(usage.sessions) ? usage.sessions : [],
    };
  },

  isDailyLimitReached(usage, dailyLimit) {
    return this.getUsageForToday(usage).today >= dailyLimit;
  },

  dailyLimitReachedMessage() {
    return "Daily limit reached. Come back tomorrow.";
  },

  async createBlockOverlay(message, platform, homeUrl, cooldownEnd = null) {
    const data = await this.getSettings();
    const strictMode = data.strictMode === true;
    const logoUrl = chrome.runtime.getURL("icons/doomshield-128.png");
    const fontStyleId = "doomshield-outfit-font";
    if (!document.getElementById(fontStyleId)) {
      const fontStyle = document.createElement("style");
      fontStyle.id = fontStyleId;
      fontStyle.textContent = `@font-face { font-family: "Outfit"; src: url("${chrome.runtime.getURL("fonts/Outfit-Regular.ttf")}") format("truetype"); font-weight: 300 800; font-style: normal; }`;
      document.head.appendChild(fontStyle);
    }

    const overlay = document.createElement("div");
    overlay.id = this.OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Content blocked by Doomshield");
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: #030504; z-index: 2147483647;
      background-image: radial-gradient(circle at 50% 38%, rgba(22, 163, 74, 0.12), transparent 28%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: white; font-family: "Outfit", ui-sans-serif, system-ui, sans-serif;
    `;

    const hasCountdown = cooldownEnd && cooldownEnd > Date.now();
    const cooldownDuration = Math.max(1, (data.coolDown || 5) * 60 * 1000);
    const savedMinutes = Math.max(0, Math.round(data.stats?.focusedTimeToday || 0));
    const homeBtn = strictMode
      ? ""
      : `<div class="go-home-btn" style="margin-top: 22px;">
          <a href="${homeUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; text-decoration: none; border-radius: 9999px; font-weight: 600; box-shadow: 0 10px 28px rgba(22, 163, 74, 0.24); transition: transform 180ms ease, box-shadow 180ms ease;">
            Go to Homepage
          </a>
        </div>`;

    const countdown = hasCountdown
      ? `<div class="doomshield-countdown-wrap" style="position: relative; width: 156px; height: 156px; margin: 0 auto 18px; display: grid; place-items: center;">
          <svg viewBox="0 0 120 120" aria-hidden="true" style="position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg);">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3" />
            <circle class="doomshield-progress-ring" cx="60" cy="60" r="52" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-dasharray="326.73" />
          </svg>
          <div style="position: absolute; top: 50%; left: 50%; width: 88px; height: 88px; transform: translate(-50%, -50%); display: grid; place-items: center; border-radius: 28px; background: rgba(255,255,255,0.96); box-shadow: 0 0 36px rgba(22,163,74,0.38);">
            <img src="${logoUrl}" alt="Doomshield" style="display: block; width: 72px; height: 72px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(22,163,74,0.32));">
          </div>
          <strong class="doomshield-countdown" style="position: absolute; bottom: -10px; padding: 5px 12px; border-radius: 9999px; background: #101612; color: #d7f9df; font-size: 14px; letter-spacing: 0.04em;"></strong>
        </div>`
      : `<div style="width: 96px; height: 96px; display: grid; place-items: center; border-radius: 30px; margin: 0 auto 18px; background: rgba(255,255,255,0.96); box-shadow: 0 0 36px rgba(22,163,74,0.32);">
          <img src="${logoUrl}" alt="Doomshield" style="display: block; width: 76px; height: 76px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(22,163,74,0.32));">
        </div>`;

    overlay.innerHTML = `
      <div style="text-align: center; max-width: 500px; padding: 28px 40px;">
        ${countdown}
        <h1 style="font-size: 36px; line-height: 1.1; margin: 0 0 10px; color: white;">Doomshield active</h1>
        <p style="font-size: 18px; line-height: 1.4; color: #d1d5d3; margin: 0 0 8px;">${hasCountdown ? "Session limit reached." : message}</p>
        <p style="font-size: 14px; color: #8e9b92; margin: 0;">${savedMinutes ? `You've saved ${savedMinutes}m today.` : "Your focus is protected."}</p>
        ${homeBtn}
      </div>
    `;

    if (hasCountdown) {
      const countdownElement = overlay.querySelector(".doomshield-countdown");
      const progressRing = overlay.querySelector(".doomshield-progress-ring");
      const circumference = 2 * Math.PI * 52;
      const updateCountdown = () => {
        const remaining = Math.max(0, cooldownEnd - Date.now());
        const totalSeconds = Math.ceil(remaining / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        countdownElement.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        progressRing.style.strokeDashoffset = String(circumference * (1 - Math.min(1, remaining / cooldownDuration)));
      };
      updateCountdown();
      const countdownInterval = setInterval(() => {
        updateCountdown();
        if (cooldownEnd <= Date.now()) {
          clearInterval(countdownInterval);
          overlay.dispatchEvent(new CustomEvent("doomshield-cooldown-complete", { bubbles: true }));
        }
      }, 250);
      overlay.dataset.countdownInterval = String(countdownInterval);
    }

    overlay.addEventListener("keydown", (e) => e.stopPropagation(), true);
    overlay.addEventListener("keyup", (e) => e.stopPropagation(), true);
    overlay.addEventListener("keypress", (e) => e.stopPropagation(), true);
    overlay.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false, capture: true });
    overlay.addEventListener("scroll", (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false, capture: true });

    return overlay;
  },

  removeBlockOverlay(isBlockedRef) {
    const overlay = document.getElementById(this.OVERLAY_ID);
    if (overlay) {
      if (overlay.dataset.countdownInterval) clearInterval(Number(overlay.dataset.countdownInterval));
      overlay.remove();
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      return true;
    }
    return false;
  },
};

window.addEventListener("unhandledrejection", (event) => {
  if (String(event.reason?.message || event.reason).includes("Extension context invalidated")) {
    event.preventDefault();
  }
});
