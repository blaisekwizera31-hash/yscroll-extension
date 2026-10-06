/** Account / Google sign-in view. */
import { getAccount, signInWithGoogle, signOut } from "../services/auth.js";
import { escapeHtml } from "../components/icons.js";

export async function renderAccount(container, { navigate }) {
  const account = await getAccount();
  if (account.signedIn) {
    container.innerHTML = `<div class="signin-view"><img src="icons/doomshield-128.png" alt="" class="signin-logo" /><h1 class="signin-brand">Doomshield</h1><p class="signin-tagline">Break the cycle.</p><div class="account-card" style="text-align:left;margin-bottom:16px;"><div class="account-email">${escapeHtml(account.displayName)}</div><div class="account-plan">${escapeHtml(account.email)}</div><div class="account-plan">Plan: ${escapeHtml(account.plan)}</div></div><button class="btn btn-outline" id="signOutBtn" style="width:100%;">Sign Out</button><button class="view-all-link" id="backFromAccountSignedIn">← Back</button></div>`;
    document.getElementById("signOutBtn")?.addEventListener("click", async () => { await signOut(); renderAccount(container, { navigate }); });
  } else {
    container.innerHTML = `<div class="signin-view"><img src="icons/doomshield-128.png" alt="" class="signin-logo" /><h1 class="signin-brand">Doomshield</h1><p class="signin-tagline">Break the cycle.</p><p class="signup-heading">Create your account</p><button class="signin-google" id="googleSignIn">Continue with Google</button><div class="signin-info-card">Your Google account securely verifies your email. Doomshield stores only your name, email, and profile image.</div><div id="signinMessage" class="signin-message" style="display:none;"></div><button class="view-all-link" id="backFromAccount">← Back</button></div>`;
    document.getElementById("googleSignIn")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = '<span class="signin-spinner" aria-hidden="true"></span> Connecting to Google...';
      const result = await signInWithGoogle();
      if (result.success) return renderAccount(container, { navigate });
      button.disabled = false;
      button.textContent = "Continue with Google";
      const message = document.getElementById("signinMessage");
      if (message) { message.style.display = "block"; message.textContent = result.message; }
    });
  }
  document.getElementById("backFromAccount")?.addEventListener("click", () => navigate("settings"));
  document.getElementById("backFromAccountSignedIn")?.addEventListener("click", () => navigate("settings"));
}
