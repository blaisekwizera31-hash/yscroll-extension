/** Google account signup and local session storage. */
import { getLocal, setLocal } from "./storage.js";
import { apiRequest } from "./api.js";

export async function getAccount() {
  const { account = {}, sessionToken } = await getLocal(["account", "sessionToken"]);
  const signedIn = Boolean(account.signedIn && sessionToken);
  return { signedIn, email: signedIn ? account.email || null : null, plan: signedIn ? account.plan || "Local" : "Local", displayName: signedIn ? account.displayName || account.email : "Local Account" };
}

export async function signInWithGoogle() {
  if (!chrome.identity?.getAuthToken) return { success: false, message: "Google sign-in is unavailable in this browser." };
  try {
    const token = await getInteractiveAuthToken();
    const authData = await apiRequest("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: token }) });
    await setLocal({
      account: { signedIn: true, id: authData.user.id, email: authData.user.email, displayName: authData.user.name, plan: "Local Account", provider: "google-oauth2" },
      sessionToken: authData.session_token,
    });
    return { success: true };
  } catch (error) {
    console.warn("Google sign-in failed", error);
    return { success: false, message: googleErrorMessage(error) };
  }
}

function getInteractiveAuthToken() {
  return new Promise((resolve, reject) => chrome.identity.getAuthToken({ interactive: true }, token => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (!token) return reject(new Error("Google did not return an access token."));
    resolve(token);
  }));
}

function googleErrorMessage(error) {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (lower.includes("invalid client") || lower.includes("client_id") || lower.includes("oauth2")) return "Google sign-in is not configured for this extension yet. Check its OAuth client ID and extension ID.";
  if (lower.includes("access_denied") || lower.includes("cancel")) return "Google sign-in was cancelled.";
  if (error instanceof TypeError && lower.includes("failed to fetch")) return "Could not reach the Doomshield server. Check your connection and try again.";
  return `Google sign-in failed: ${message || "unknown error"}`;
}

export async function signOut() { await setLocal({ account: { signedIn: false, email: null, plan: "Local" }, sessionToken: null }); return { success: true }; }
