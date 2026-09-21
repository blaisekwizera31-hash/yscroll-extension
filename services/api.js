const API_BASE_URL = "https://doomshield.blaisekwizera31.workers.dev";

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
    throw new Error(
      `The server at ${API_BASE_URL} returned an unexpected response (${response.status}). ` +
      "The backend may not be deployed yet."
    );
  }
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return body;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
