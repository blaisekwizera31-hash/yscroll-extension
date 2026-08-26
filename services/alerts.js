/**
 * Doomshield Alert System
 * Local event log stored in chrome.storage.local
 */
import { getLocal, setLocal } from "./storage.js";

const MAX_ALERTS = 100;

/**
 * @typedef {'milestone'|'block'|'summary'|'warning'|'protection'} AlertType
 */

/**
 * @param {object} alert
 * @param {AlertType} alert.type
 * @param {string} alert.title
 * @param {string} alert.description
 * @param {string} [alert.platform]
 * @param {boolean} [alert.dedupeKey]
 */
export async function addAlert({ type, title, description, platform, dedupeKey }) {
  const { alerts = [] } = await getLocal(["alerts"]);
  const today = new Date().toDateString();

  if (dedupeKey) {
    const exists = alerts.some(
      (a) => a.dedupeKey === dedupeKey && new Date(a.timestamp).toDateString() === today
    );
    if (exists) return null;
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    description,
    timestamp: Date.now(),
    read: false,
    platform: platform || null,
    dedupeKey: dedupeKey || null,
  };

  const updated = [entry, ...alerts].slice(0, MAX_ALERTS);
  await setLocal({ alerts: updated });
  return entry;
}

export async function getAlerts(filter = "all") {
  const { alerts = [] } = await getLocal(["alerts"]);
  if (filter === "all") return alerts;
  return alerts.filter((a) => a.type === filter);
}

export async function markAlertRead(id) {
  const { alerts = [] } = await getLocal(["alerts"]);
  const updated = alerts.map((a) => (a.id === id ? { ...a, read: true } : a));
  await setLocal({ alerts: updated });
}

export async function markAllAlertsRead() {
  const { alerts = [] } = await getLocal(["alerts"]);
  const updated = alerts.map((a) => ({ ...a, read: true }));
  await setLocal({ alerts: updated });
}

export function formatAlertTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;

  if (diffMs < 60000) return "Just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function getAlertIcon(type) {
  switch (type) {
    case "milestone":
      return "trophy";
    case "block":
      return "shield";
    case "summary":
      return "chart";
    case "warning":
      return "warning";
    case "protection":
      return "shield-check";
    default:
      return "bell";
  }
}
