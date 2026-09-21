/** Account registration and local session storage. */
import { getLocal, setLocal } from "./storage.js";
import { apiRequest } from "./api.js";

export async function getAccount() {
  const { account = {}, sessionToken } = await getLocal(["account", "sessionToken"]);
  const signedIn = Boolean(account.signedIn && sessionToken);

  return {
    signedIn,
    email: signedIn ? account.email || null : null,
    plan: signedIn ? account.plan || "Local" : "Local",
    displayName: signedIn ? account.displayName || account.email : "Local Account",
    subtitle: signedIn ? account.plan : "Not signed in",
  };
}

export async function registerWithEmail({ email, username }) {
  try {
    const authData = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username }),
    });

    await setLocal({
      account: {
        signedIn: true,
        id: authData.user.id,
        email: authData.user.email,
        displayName: authData.user.name,
        plan: "Local Account",
        provider: "email",
      },
      sessionToken: authData.session_token,
    });
    return { success: true, account: await getAccount() };
  } catch (error) {
    console.warn("Email registration failed", error);
    return { success: false, message: String(error?.message || "Could not create your account.") };
  }
}

export async function signOut() {
  await setLocal({
    account: { signedIn: false, email: null, plan: "Local" },
    sessionToken: null,
  });
  return { success: true };
}
