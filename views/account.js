/**
 * Account / Sign In View
 */
import { getAccount, registerWithEmail, signOut } from "../services/auth.js";
import { escapeHtml } from "../components/icons.js";

export async function renderAccount(container, { navigate }) {
  const account = await getAccount();

  if (account.signedIn) {
    container.innerHTML = `
      <div class="signin-view">
        <img src="icons/doomshield-128.png" alt="" class="signin-logo" />
        <h1 class="signin-brand">Doomshield</h1>
        <p class="signin-tagline">Break the cycle.</p>
        <div class="account-card" style="text-align:left;margin-bottom:16px;">
          <div class="account-email">${escapeHtml(account.displayName)}</div>
          <div class="account-plan">${escapeHtml(account.email)}</div>
          <div class="account-plan">Plan: ${escapeHtml(account.plan)}</div>
        </div>
        <button class="btn btn-outline" id="signOutBtn" style="width:100%;">Sign Out</button>
        <button class="view-all-link" id="backFromAccountSignedIn" style="margin-top:16px;">← Back</button>
      </div>
    `;

    document.getElementById("signOutBtn")?.addEventListener("click", async () => {
      await signOut();
      renderAccount(container, { navigate });
    });
  } else {
    container.innerHTML = `
      <div class="signin-view">
        <img src="icons/doomshield-128.png" alt="" class="signin-logo" />
        <h1 class="signin-brand">Doomshield</h1>
        <p class="signin-tagline">Break the cycle.</p>
        <form id="emailSignInForm" class="email-signin-form">
          <label for="username">Username</label>
          <input id="username" name="username" type="text" maxlength="50" autocomplete="username" required placeholder="Your display name" />
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" maxlength="254" autocomplete="email" required placeholder="you@example.com" />
          <button class="signin-google" type="submit">Continue with email</button>
        </form>
        <div class="signin-info-card">
          Reclaim your time and focus. Doomshield helps you navigate away from endless scrolling and back to intentional living.
        </div>
        <div id="signinMessage" class="signin-message" style="display:none;"></div>
        <button class="view-all-link" id="backFromAccount" style="margin-top:16px;">← Back</button>
      </div>
    `;

    document.getElementById("emailSignInForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await registerWithEmail({
        username: form.get("username"),
        email: form.get("email"),
      });
      if (result.success) {
        renderAccount(container, { navigate });
        return;
      }
      const msgEl = document.getElementById("signinMessage");
      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.textContent = result.message;
      }
    });
  }

  document.getElementById("backFromAccount")?.addEventListener("click", () => navigate("settings"));
  document.getElementById("backFromAccountSignedIn")?.addEventListener("click", () => navigate("settings"));
}
