/**
 * Doomshield Popup — Single Page Application
 */
import { ensureDefaults } from "./services/storage.js";
import { renderHome } from "./views/home.js";
import { renderAlerts } from "./views/alerts.js";
import { renderBoard } from "./views/board.js";
import { renderSettings } from "./views/settings.js";
import { renderAccount } from "./views/account.js";

const VIEWS = {
  home: { el: "view-home", render: renderHome },
  alerts: { el: "view-alerts", render: renderAlerts },
  board: { el: "view-board", render: renderBoard },
  settings: { el: "view-settings", render: renderSettings },
  account: { el: "view-account", render: renderAccount },
};

let currentView = "home";

function navigate(view) {
  if (!VIEWS[view]) return;
  currentView = view;

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });

  document.getElementById("mainNav").style.display =
    view === "account" ? "none" : "flex";
  document.querySelector(".nav-divider").style.display =
    view === "account" ? "none" : "block";

  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));

  const viewConfig = VIEWS[view];
  const container = document.getElementById(viewConfig.el);
  container.classList.add("active");
  viewConfig.render(container, { navigate });
}

async function init() {
  await ensureDefaults();

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => navigate(item.dataset.view));
  });

  document.getElementById("accountBtn")?.addEventListener("click", () => {
    navigate("account");
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const relevant = ["usage", "isActive", "stats", "alerts", "activeFocusSession", "account", "sessionToken"];
    if (relevant.some((k) => k in changes)) {
      refreshCurrentView();
    }
  });

  navigate("home");
}

function refreshCurrentView() {
  const viewConfig = VIEWS[currentView];
  const container = document.getElementById(viewConfig.el);
  if (container?.classList.contains("active")) {
    viewConfig.render(container, { navigate });
  }
}

init();
