/**
 * Home View
 */
import { getDashboardStats, formatDuration } from "../services/stats.js";
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

  container.innerHTML = `
    <div class="card card-green">
      <div class="card-header">
        <span class="card-label">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="card-timer" id="homeTimer">${formatDuration(stats.timeSavedToday)}</div>
      <p class="card-desc">Time spent away from enabled social platforms today.</p>
      <div class="btn-row">
        <button class="btn btn-dark" id="pauseShieldBtn">
          ${stats.isActive ? "Pause Shield" : "Resume Shield"}
        </button>
        <button class="btn btn-outline" id="shareMilestoneBtn">Share Milestone</button>
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
        Usage: ${Math.ceil(stats.usageToday)} / ${stats.dailyLimit} min today
        · Focus Score: ${stats.focusScore}
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
  const text = `I've spent ${formatDuration(stats.focusedTimeToday || 0)} away from social media today with Doomshield! Focus Score: ${stats.focusScore}/100.`;

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
