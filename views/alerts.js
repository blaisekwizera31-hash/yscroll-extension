/**
 * Alerts View
 */
import { getAlerts, formatAlertTime, getAlertIcon, markAlertRead } from "../services/alerts.js";
import { getIcon, escapeHtml } from "../components/icons.js";

let currentFilter = "all";

export async function renderAlerts(container) {
  container.innerHTML = `
    <h1 class="page-title">Your Alerts</h1>
    <p class="page-subtitle">Stay informed on your digital wellbeing.</p>
    <div class="filter-pills" role="tablist">
      <button class="filter-pill ${currentFilter === "all" ? "active" : ""}" data-filter="all" role="tab">All</button>
      <button class="filter-pill ${currentFilter === "milestone" ? "active" : ""}" data-filter="milestone" role="tab">Milestones</button>
      <button class="filter-pill ${currentFilter === "block" ? "active" : ""}" data-filter="block" role="tab">Blocks</button>
    </div>
    <div id="alertsList"></div>
  `;

  container.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      currentFilter = pill.dataset.filter;
      renderAlerts(container);
    });
  });

  await renderAlertsList(container);
}

async function renderAlertsList(container) {
  const listEl = container.querySelector("#alertsList");
  const filter = currentFilter === "all" ? "all" : currentFilter;
  const alerts = await getAlerts(filter);

  if (!alerts.length) {
    listEl.innerHTML = `<div class="empty-state">
      ${getIcon("bell")}
      <p>No ${filter === "all" ? "" : filter + " "}alerts yet.</p>
    </div>`;
    return;
  }

  listEl.innerHTML = alerts
    .map(
      (a) => `
    <div class="alert-card ${a.read ? "" : "unread"}" data-id="${escapeHtml(a.id)}">
      <div class="alert-icon-circle">${getIcon(getAlertIcon(a.type))}</div>
      <div class="alert-card-body">
        <div class="alert-card-title">${escapeHtml(a.title)}</div>
        <div class="alert-card-desc">${escapeHtml(a.description)}</div>
        <div class="alert-card-time">${formatAlertTime(a.timestamp)}</div>
      </div>
    </div>
  `
    )
    .join("");

  listEl.querySelectorAll(".alert-card").forEach((card) => {
    card.addEventListener("click", async () => {
      await markAlertRead(card.dataset.id);
      card.classList.remove("unread");
    });
  });
}
