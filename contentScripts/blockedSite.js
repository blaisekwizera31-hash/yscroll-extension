/**
 * Doomshield Blocked Site Content Script
 * Blocks user-added custom domains.
 */
(function () {
  "use strict";

  window.addEventListener("unhandledrejection", (event) => {
    if (String(event.reason?.message || event.reason).includes("Extension context invalidated")) {
      event.preventDefault();
    }
  });

  const OVERLAY_ID = "doomshield-block-overlay";

  function isContextValid() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  }

  // Must match background.js normalization exactly, otherwise this script can
  // disagree with the network-level block and cause a flicker loop.
  function normalizeDomain(domain) {
    if (typeof domain !== "string") return null;
    return domain.trim().toLowerCase().replace(/^www\./, "") || null;
  }

  async function shouldBlock() {
    if (!isContextValid()) return false;
    const data = await chrome.storage.local.get(["isActive", "blockedSites"]);
    if (!data.isActive) return false;

    const hostname = window.location.hostname.toLowerCase().replace(/^www\./, "");
    const domains = (data.blockedSites || [])
      .map(normalizeDomain)
      .filter(Boolean);
    return domains.some((domain) => hostname === domain || hostname.endsWith("." + domain));
  }

  /**
   * Run the check once the document can host an overlay. At document_start,
   * document.body is still null, so appending would throw and leave the site
   * unblocked until the next poll.
   */
  function whenBodyReady(callback) {
    if (document.body) {
      callback();
      return;
    }
    document.addEventListener("DOMContentLoaded", () => callback(), { once: true });
  }

  let overlayActive = false;

  function createOverlay() {
    if (overlayActive && document.getElementById(OVERLAY_ID)) return;
    if (overlayActive) {
      // Overlay was removed by page JS — re-attach immediately.
      attachOverlay();
      return;
    }
    overlayActive = true;
    attachOverlay();
    watchForRemoval();
  }

  function attachOverlay() {

    const logoUrl = chrome.runtime.getURL("icons/doomshield-128.png");
    const fontStyle = document.createElement("style");
    fontStyle.textContent = `@font-face { font-family: "Outfit"; src: url("${chrome.runtime.getURL("fonts/Outfit-Regular.ttf")}") format("truetype"); font-weight: 300 800; font-style: normal; }`;
    document.head.appendChild(fontStyle);
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Site blocked by Doomshield");
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:#171A18;z-index:2147483647;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:"Outfit",ui-sans-serif,system-ui,sans-serif;
    `;

    overlay.innerHTML = `
      <div style="text-align:center;max-width:480px;padding:40px;">
        <div style="width:72px;height:72px;background:#fff;border-radius:16px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
          <img src="${logoUrl}" alt="Doomshield" style="width:100%;height:100%;object-fit:contain;padding:8px;">
        </div>
        <h1 style="font-size:32px;margin-bottom:12px;color:#fff;">Doomshield active</h1>
        <p style="font-size:16px;color:#ccc;margin-bottom:8px;">This site is blocked by Doomshield.</p>
        <p style="font-size:14px;color:#888;">Reclaim your focus — manage blocked sites in Settings.</p>
      </div>
    `;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.appendChild(overlay);

    chrome.runtime.sendMessage({ type: "CONTENT_BLOCKED", platform: "custom", reason: "blocked-site" });
  }

  function removeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.remove();
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      chrome.runtime.sendMessage({ type: "CONTENT_UNBLOCKED", platform: "custom" });
    }
    overlayActive = false;
    stopWatching();
  }

  let observer = null;

  /** Re-attach the overlay instantly if the site's own JS removes it, so there
   *  is no visible gap between removal and the next poll tick. */
  function watchForRemoval() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(() => {
      if (overlayActive && !document.getElementById(OVERLAY_ID)) {
        attachOverlay();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopWatching() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  async function check() {
    const block = await shouldBlock();
    if (block) whenBodyReady(createOverlay);
    else removeOverlay();
  }

  check();
  setInterval(check, 3000);
})();
