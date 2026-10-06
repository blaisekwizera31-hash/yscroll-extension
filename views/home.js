/**
 * Home View
 */
import { getDashboardStats, formatDuration, formatHoursMinutes } from "../services/stats.js";
import { getAlerts, formatAlertTime, getAlertIcon } from "../services/alerts.js";
import { getIcon, escapeHtml } from "../components/icons.js";
import { setLocal } from "../services/storage.js";
import { addAlert } from "../services/alerts.js";

export async function renderHome(container, { navigate }) {
  const stats = await getDashboardStats();
  const alerts = await getAlerts();
  const recentAlerts = alerts.slice(0, 3);

  const statusLabel = stats.isActive
    ? stats.shieldStatus === "Limit Reached"
      ? "Focus Shield — Limit Reached"
      : "Focus Shield Active"
    : "Focus Shield Paused";

  const shieldClass =
    stats.shieldStatus === "Paused"
      ? "paused"
      : stats.shieldStatus === "Disabled"
      ? "disabled"
      : stats.shieldStatus === "Limit Reached"
      ? "limit"
      : "";

  // Progress bar percentage for daily usage
  const usagePct = Math.min(100, Math.round((stats.usageToday / stats.dailyLimit) * 100));
  const progressColor =
    usagePct >= 100 ? "#ef4444" : usagePct >= 80 ? "#f59e0b" : "rgba(255,255,255,0.9)";

  // "Time on social" — the real measured number
  const usageFormatted = formatDuration(stats.usageToday);
  // "Time focused" — time the user was active but NOT on social platforms
  const focusedFormatted = formatHoursMinutes(stats.focusedTimeToday);

  container.innerHTML = `
    <div class="card card-green">
      <div class="card-header">
        <span class="card-label">${escapeHtml(statusLabel)}</span>
        <span style="font-size:11px;font-weight:600;opacity:0.8;">Focus Score: ${stats.focusScore}/100</span>
      </div>
      <div class="card-timer" id="homeTimer">${usageFormatted}</div>
      <p class="card-desc" style="margin-bottom:10px;">Social media used today — ${Math.ceil(stats.usageToday)} / ${stats.dailyLimit} min</p>

      <div style="background:rgba(255,255,255,0.18);border-radius:999px;height:6px;margin-bottom:14px;overflow:hidden;">
        <div style="height:100%;width:${usagePct}%;background:${progressColor};border-radius:999px;transition:width 0.4s ease;"></div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:14px;">
        <div style="flex:1;background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 12px;text-align:center;">
          <div style="font-size:18px;font-weight:700;">${focusedFormatted}</div>
          <div style="font-size:10px;opacity:0.8;margin-top:2px;">Focused today</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 12px;text-align:center;">
          <div style="font-size:18px;font-weight:700;">${formatDuration(stats.timeSavedToday)}</div>
          <div style="font-size:10px;opacity:0.8;margin-top:2px;">Time saved</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 12px;text-align:center;">
          <div style="font-size:18px;font-weight:700;">${stats.blockedAttempts}</div>
          <div style="font-size:10px;opacity:0.8;margin-top:2px;">Blocks today</div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-dark" id="pauseShieldBtn">
          ${stats.isActive ? "Pause Shield" : "Resume Shield"}
        </button>
        <button class="btn btn-outline" id="shareMilestoneBtn">Share</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Shield Status</h3>
      <div class="shield-status-area ${shieldClass}">
        <div class="shield-icon">${getIcon("shield")}</div>
        <div class="shield-state">${escapeHtml(stats.shieldStatus)}</div>
        <div class="shield-desc">${getShieldDescription(stats.shieldStatus)}</div>
      </div>
      <p class="card-desc" style="margin-top:10px;margin-bottom:0;">
        ${stats.limitReached
          ? "Daily limit reached. Come back tomorrow."
          : `${Math.max(0, stats.dailyLimit - Math.ceil(stats.usageToday))} min remaining today`}
      </p>
    </div>

    <div class="card">
      <h3 class="section-title">Recent Alerts</h3>
      <div id="homeAlertsPreview">
        ${renderAlertsPreview(recentAlerts)}
      </div>
      ${alerts.length > 0 ? `<button class="view-all-link" id="viewAllAlerts">View all alerts</button>` : ""}
    </div>
  `;

  document.getElementById("pauseShieldBtn")?.addEventListener("click", async () => {
    await setLocal({ isActive: !stats.isActive });
    if (!stats.isActive) {
      await addAlert({
        type: "protection",
        title: "Protection Activated",
        description: "Your Doomshield is now active.",
        dedupeKey: `protection-on-${Date.now()}`,
      });
    }
    renderHome(container, { navigate });
  });

  document.getElementById("shareMilestoneBtn")?.addEventListener("click", () => {
    shareMilestone(stats);
  });

  document.getElementById("viewAllAlerts")?.addEventListener("click", () => {
    navigate("alerts");
  });
}

function getShieldDescription(status) {
  switch (status) {
    case "Active":
      return "Your digital environment is currently protected.";
    case "Paused":
      return "Protection is paused. Resume when ready.";
    case "Disabled":
      return "All platforms are disabled. Enable at least one.";
    case "Limit Reached":
      return "Daily limit reached. Time to refocus.";
    default:
      return "Monitoring your digital wellbeing.";
  }
}

function renderAlertsPreview(alerts) {
  if (!alerts.length) {
    return `<div class="empty-state">
      ${getIcon("bell")}
      <p>No alerts yet. Your shield is standing by.</p>
    </div>`;
  }

  return alerts
    .map(
      (a) => `
    <div class="alert-preview-item">
      <div class="alert-icon-circle">${getIcon(getAlertIcon(a.type))}</div>
      <div class="alert-preview-content">
        <div class="alert-preview-title">${escapeHtml(a.title)}</div>
        <div class="alert-preview-desc">${escapeHtml(a.description)}</div>
      </div>
      <div class="alert-preview-time">${formatAlertTime(a.timestamp)}</div>
    </div>
  `
    )
    .join("");
}

async function shareMilestone(stats) {
  const text = `I've only spent ${formatDuration(stats.usageToday || 0)} on social media today — and saved ${formatDuration(stats.timeSavedToday || 0)} with Doomshield! Focus Score: ${stats.focusScore}/100.`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Doomshield Milestone", text });
      return;
    } catch (_) {}
  }

  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("shareMilestoneBtn");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = orig), 2000);
    }
  } catch (_) {
    alert(text);
  }
}
