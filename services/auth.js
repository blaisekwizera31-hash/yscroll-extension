/**
 * Doomshield Auth Service
 *
 * Uses Chrome Identity for an interactive Google sign-in and stores only the
 * returned profile summary locally.
 */

import { getLocal, setLocal } from "./storage.js";
import { apiRequest } from "./api.js";

export const AUTH_CONFIG = {
  googleOAuthConfigured: true,
  provider: "google-oauth2",
};

export async function getAccount() {
  const { account = {}, sessionToken } = await getLocal([
    "account",
    "sessionToken",
  ]);

  const signedIn = Boolean(account.signedIn && sessionToken);

  return {
    signedIn,
    email: signedIn ? account.email || null : null,
    plan: signedIn ? account.plan || "Local" : "Local",
    displayName: signedIn ? account.email : "Local Account",
    subtitle: signedIn ? account.plan : "Not signed in",
  };
}

export async function signInWithGoogle() {
  if (!chrome.identity?.getAuthToken) {
    return {
      success: false,
      message:
        "Interactive Google sign-in is unavailable in this browser.",
    };
  }

  // IMPORTANT:
  // Declare stage outside the try block so the catch block can access it.
  let stage = "google-profile";

  try {
    // Get the Google access token.
    const token = await getInteractiveAuthToken();

    // Get the Google user's profile.
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const profile = await response.json();

    if (!response.ok || !profile?.email) {
      throw new Error(
        profile?.error?.message ||
          `Google profile request failed (${response.status}).`
      );
    }

    // Move to backend authentication stage.
    stage = "backend-auth";

    const authData = await apiRequest("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({
        credential: token,
      }),
    });

    // Store the authenticated account locally.
    await setLocal({
      account: {
        signedIn: true,
        id: authData.user?.id || profile.id || null,
        email: authData.user?.email || profile.email,
        displayName:
          authData.user?.name ||
          profile.name ||
          profile.email,
        picture:
          authData.user?.avatar_url ||
          profile.picture ||
          null,
        plan: "Local Account",
        provider: "google-oauth2",
      },

      sessionToken: authData.session_token,
    });

    return {
      success: true,
      account: await getAccount(),
    };
  } catch (error) {
    console.warn(
      `Interactive Google sign-in failed [stage: ${stage}]`,
      error
    );

    return {
      success: false,
      message: getAuthErrorMessage(error, stage),
    };
  }
}

function getInteractiveAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { interactive: true },
      (token) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!token) {
          reject(new Error("Google did not return an access token."));
          return;
        }

        resolve(token);
      }
    );
  });
}

function getAuthErrorMessage(error, stage = "unknown") {
  const message = String(error?.message || error || "");
  const lowerMessage = message.toLowerCase();

  // "Failed to fetch" means the request never reached the network.
  // Usually this is caused by missing host_permissions, an offline
  // connection, or a blocked/CSP-restricted origin.
  if (
    error instanceof TypeError &&
    lowerMessage.includes("failed to fetch")
  ) {
    if (stage === "google-profile") {
      return (
        "Could not reach Google's profile endpoint " +
        "(https://www.googleapis.com). " +
        "Check that 'https://www.googleapis.com/*' is listed " +
        "under host_permissions in manifest.json and reload the extension."
      );
    }

    if (stage === "backend-auth") {
      return (
        "Could not reach the Doomshield server " +
        "(https://doomshield.pages.dev). " +
        "Check your network connection and that " +
        "'https://doomshield.pages.dev/*' is listed under " +
        "host_permissions in manifest.json."
      );
    }
  }

  if (
    lowerMessage.includes("access_denied") ||
    lowerMessage.includes("cancel")
  ) {
    return "Google sign-in was cancelled.";
  }

  if (
    lowerMessage.includes("invalid client") ||
    lowerMessage.includes("client_id") ||
    lowerMessage.includes("oauth2")
  ) {
    return (
      "Google sign-in is misconfigured. " +
      "Check the OAuth client ID and manifest oauth2 settings."
    );
  }

  if (lowerMessage.includes("scope")) {
    return (
      "Google sign-in requested an invalid scope. " +
      "Check the manifest oauth2 scopes."
    );
  }

  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("failed to fetch")
  ) {
    return (
      "Google sign-in could not reach Google. " +
      "Check your network connection."
    );
  }

  return `Google sign-in failed: ${message || "unknown error"}`;
}

export async function signOut() {
  await setLocal({
    account: {
      signedIn: false,
      email: null,
      plan: "Local",
    },
    sessionToken: null,
  });

  return {
    success: true,
  };
}