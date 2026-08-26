/**
 * Settings View
 */
import { getAllSettings, setLocal } from "../services/storage.js";
import { escapeHtml } from "../components/icons.js";

const PLATFORMS = [
  { key: "youtube", name: "YouTube Shorts", icon: "icons/shorts.png" },
  { key: "tiktok", name: "TikTok", icon: "icons/tiktok.png" },
  { key: "linkedin", name: "LinkedIn Feed", icon: null },
  { key: "instagram", name: "Instagram", icon: "icons/instagram.png" },
  { key: "facebook", name: "Facebook", icon: "icons/facebook.png" },
  { key: "x", name: "X (Twitter)", icon: "icons/x.svg" },
];

export async function renderSettings(container, { navigate }) {
  const settings = await getAllSettings();

  // Preserve in-progress input values across re-renders (e.g. triggered by
  // chrome.storage.onChanged) so unrelated storage ticks never wipe what the
  // user is typing.
  const prev = {
    blockedSite: container.querySelector("#blockedSiteInput")?.value ?? "",
    wasFocused: document.activeElement?.id === "blockedSiteInput",
  };

  container.innerHTML = `
    <h1 class="page-title">Settings</h1>
    <p class="page-subtitle">Configure your shield and focus preferences.</p>

    <div class="settings-section">
      <h2 class="settings-section-title">Shield Configuration</h2>
      <div class="card">
        <div class="setting-row">
          <div class="setting-info">
            <h4>Master Shield</h4>
            <p>Toggle all protection features.</p>
          </div>
          <label class="toggle">
            <input type="checkbox" id="masterShield" ${settings.isActive ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Strict Mode</h4>
            <p>Blocks access completely. No bypass allowed.</p>
          </div>
          <label class="toggle">
            <input type="checkbox" id="strictMode" ${settings.strictMode ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Limits</h2>
      <div class="card">
        ${renderLimitControl("Daily Limit", "dailyLimit", settings.dailyLimit, 5, 120, 5)}
        ${renderLimitControl("Session Limit", "sessionLimit", settings.sessionLimit, 1, 60, 1)}
        ${renderLimitControl("Cool Down", "coolDown", settings.coolDown, 1, 30, 1)}
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Platforms</h2>
      <div class="card">
        ${PLATFORMS.map(
          (p) => `
          <div class="platform-row">
            <div class="platform-row-info">
              ${p.icon ? `<img src="${p.icon}" alt="" />` : `<span style="width:20px;text-align:center;font-weight:700;color:#0077b5;">in</span>`}
              ${escapeHtml(p.name)}
            </div>
            <label class="toggle">
              <input type="checkbox" data-platform="${p.key}" ${settings.platforms[p.key] ? "checked" : ""} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        `
        ).join("")}
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Blocked Sites</h2>
      <div class="card">
        <div class="blocked-input-row">
          <input type="text" class="blocked-input" id="blockedSiteInput" placeholder="Add website (e.g. reddit.com)" aria-label="Domain to block" />
          <button class="btn btn-green" id="addBlockedSite" style="flex:0;padding:8px 16px;">Add</button>
        </div>
        <ul class="blocked-list" id="blockedList">
          ${renderBlockedList(settings.blockedSites)}
        </ul>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Notifications</h2>
      <div class="card">
        <div class="setting-row">
          <div class="setting-info">
            <h4>Usage Alerts</h4>
            <p>Get notified when nearing time limits.</p>
          </div>
          <label class="toggle">
            <input type="checkbox" id="usageAlerts" ${settings.notificationSettings?.usageAlerts !== false ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Weekly Summary</h4>
            <p>Receive a report of time saved.</p>
          </div>
          <label class="toggle">
            <input type="checkbox" id="weeklySummary" ${settings.notificationSettings?.weeklySummary !== false ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-section-title">Account</h2>
      <div class="account-card">
        <div class="account-email">${settings.account?.signedIn ? escapeHtml(settings.account.email) : "Local Account"}</div>
        <div class="account-plan">${settings.account?.signedIn ? escapeHtml(settings.account.plan) : "Not signed in"}</div>
        <button class="btn btn-dark" id="manageAccountBtn" style="width:100%;">Manage</button>
      </div>
    </div>
  `;

  bindSettingsEvents(container, settings, navigate);

  // Restore user-typed input values lost by the re-render above.
  const blockedInput = container.querySelector("#blockedSiteInput");
  if (blockedInput && prev.blockedSite && !blockedInput.value) {
    blockedInput.value = prev.blockedSite;
    if (prev.wasFocused) blockedInput.focus();
  }
}

function renderLimitControl(label, key, value, min, max, step) {
  return `
    <div class="limit-control" data-limit="${key}">
      <div>
        <div style="font-size:13px;font-weight:600;">${label}</div>
        <div class="limit-value"><span class="limit-display">${value}</span> min</div>
      </div>
      <div class="limit-buttons">
        <button class="limit-dec" aria-label="Decrease ${label}">−</button>
        <div class="divider"></div>
        <button class="limit-inc" aria-label="Increase ${label}">+</button>
      </div>
    </div>
  `;
}

function renderBlockedList(sites) {
  if (!sites?.length) {
    return `<li class="blocked-item" style="color:var(--gray);border:none;">No blocked sites yet.</li>`;
  }
  return sites
    .map(
      (d) => `
    <li class="blocked-item">
      <span>${escapeHtml(d)}</span>
      <button class="blocked-remove" data-domain="${escapeHtml(d)}" aria-label="Remove ${escapeHtml(d)}">Remove</button>
    </li>
  `
    )
    .join("");
}

function bindSettingsEvents(container, settings, navigate) {
  container.querySelector("#masterShield")?.addEventListener("change", async (e) => {
    await setLocal({ isActive: e.target.checked });
  });

  container.querySelector("#strictMode")?.addEventListener("change", async (e) => {
    await setLocal({ strictMode: e.target.checked });
  });

  container.querySelectorAll(".limit-control").forEach((ctrl) => {
    const key = ctrl.dataset.limit;
    const display = ctrl.querySelector(".limit-display");
    const limits = { dailyLimit: [5, 120, 5], sessionLimit: [1, 60, 1], coolDown: [1, 30, 1] };
    const [min, max, step] = limits[key];

    ctrl.querySelector(".limit-dec")?.addEventListener("click", async () => {
      let val = parseInt(display.textContent, 10);
      val = Math.max(min, val - step);
      display.textContent = val;
      await setLocal({ [key]: val });
    });

    ctrl.querySelector(".limit-inc")?.addEventListener("click", async () => {
      let val = parseInt(display.textContent, 10);
      val = Math.min(max, val + step);
      display.textContent = val;
      await setLocal({ [key]: val });
    });
  });

  container.querySelectorAll("[data-platform]").forEach((input) => {
    input.addEventListener("change", async () => {
      const platforms = { ...settings.platforms };
      platforms[input.dataset.platform] = input.checked;
      await setLocal({ platforms });
      settings.platforms = platforms;
    });
  });

  const addBlockedSite = async () => {
    const input = container.querySelector("#blockedSiteInput");
    const domain = normalizeDomain(input.value);
    if (!domain) {
      input.focus();
      return;
    }
    const sites = [...(settings.blockedSites || [])];
    if (sites.includes(domain)) return;

    if (!(await requestBlockedPermission(domain))) return;
    sites.push(domain);
    await setLocal({ blockedSites: sites });
    settings.blockedSites = sites;
    container.querySelector("#blockedList").innerHTML = renderBlockedList(sites);
    input.value = ""; // intentional clear after successful add
    chrome.runtime.sendMessage({ type: "REGISTER_BLOCKED_SITES" });
  };

  container.querySelector("#addBlockedSite")?.addEventListener("click", addBlockedSite);

  // Pressing Enter adds the domain too.
  container.querySelector("#blockedSiteInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBlockedSite();
  });

  container.querySelector("#blockedList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".blocked-remove");
    if (!btn) return;
    const domain = btn.dataset.domain;
    const sites = (settings.blockedSites || []).filter((d) => d !== domain);
    await setLocal({ blockedSites: sites });
    settings.blockedSites = sites;
    container.querySelector("#blockedList").innerHTML = renderBlockedList(sites);
    chrome.runtime.sendMessage({ type: "REGISTER_BLOCKED_SITES" });
  });

  

  container.querySelector("#usageAlerts")?.addEventListener("change", async (e) => {
    await setLocal({
      notificationSettings: { ...settings.notificationSettings, usageAlerts: e.target.checked },
    });
  });

  container.querySelector("#weeklySummary")?.addEventListener("change", async (e) => {
    await setLocal({
      notificationSettings: { ...settings.notificationSettings, weeklySummary: e.target.checked },
    });
  });

  container.querySelector("#manageAccountBtn")?.addEventListener("click", () => {
    navigate("account");
  });
}


function normalizeDomain(input) {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    return null;
  }
  return d;
}

async function requestBlockedPermission(domain) {
  if (!chrome.permissions?.request) return true;
  try {
    return await chrome.permissions.request({
      origins: [`*://*.${domain}/*`, `*://${domain}/*`],
    });
  } catch (_) {}
  return false;
}
