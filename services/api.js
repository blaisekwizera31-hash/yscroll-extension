const API_BASE_URL = "https://doomshield.pages.dev";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};
  if (!contentType.includes("application/json")) {
    throw new Error("The Doomshield API is not deployed at the configured address.");
  }
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return body;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
