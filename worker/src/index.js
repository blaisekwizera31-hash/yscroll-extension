const ALLOWED_ORIGINS = new Set(["https://doomshield.pages.dev"]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers });

    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/api/auth/google") {
        return json(await authenticateGoogle(request, env), 200, headers);
      }
      if (request.method === "POST" && url.pathname === "/api/usage/sync") {
        const user = await requireUser(request, env);
        return json(await syncUsage(request, env, user.id), 200, headers);
      }
      if (request.method === "GET" && url.pathname === "/api/leaderboard") {
        await requireUser(request, env);
        const { results } = await env.DB.prepare(`
          SELECT u.id, u.name, u.avatar_url,
            SUM(s.time_saved_seconds) AS time_saved_seconds
          FROM usage_stats s
          JOIN users u ON u.id = s.user_id
          GROUP BY u.id, u.name, u.avatar_url
          ORDER BY time_saved_seconds DESC
          LIMIT 50
        `).all();
        return json({ entries: results || [] }, 200, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      console.error(error);
      return json({ error: error.message || "Request failed" }, error.status || 500, headers);
    }
  },
};

async function authenticateGoogle(request, env) {
  const body = await request.json();
  if (!body.credential) throw httpError("Google credential is required.", 400);
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${body.credential}` },
  });
  const googleUser = await response.json();
  if (!response.ok || !googleUser.sub || !googleUser.email) {
    throw httpError("Google credential could not be verified.", 401);
  }

  await env.DB.prepare(`
    INSERT INTO users (id, email, name, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      avatar_url = excluded.avatar_url
  `).bind(googleUser.sub, googleUser.email, googleUser.name || googleUser.email, googleUser.picture || null).run();

  return {
    session_token: await signJwt({ sub: googleUser.sub, email: googleUser.email }, env.JWT_SECRET),
    user: { id: googleUser.sub, email: googleUser.email, name: googleUser.name || googleUser.email, avatar_url: googleUser.picture || null },
  };
}

async function syncUsage(request, env, userId) {
  const body = await request.json();
  const date = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(`
    INSERT INTO usage_stats (user_id, date, time_saved_seconds, time_scrolled_seconds)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      time_saved_seconds = usage_stats.time_saved_seconds + excluded.time_saved_seconds,
      time_scrolled_seconds = usage_stats.time_scrolled_seconds + excluded.time_scrolled_seconds
  `).bind(userId, date, nonNegativeInteger(body.time_saved_seconds), nonNegativeInteger(body.time_scrolled_seconds)).run();
  return { ok: true, date };
}

async function requireUser(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw httpError("Authentication required.", 401);
  const payload = await verifyJwt(token, env.JWT_SECRET);
  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user) throw httpError("User not found.", 401);
  return user;
}

function nonNegativeInteger(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
function httpError(message, status) { const error = new Error(message); error.status = status; return error; }
function corsHeaders(origin) {
  const headers = { "Content-Type": "application/json" };
  if (ALLOWED_ORIGINS.has(origin) || /^chrome-extension:\/\/[a-z]{32}$/.test(origin || "")) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return headers;
}
function json(data, status, headers) { return new Response(JSON.stringify(data), { status, headers }); }
function base64Url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decodeBase64Url(value) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4); return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)); }
async function signJwt(payload, secret) {
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64Url(new TextEncoder().encode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${data}.${base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))))}`;
}
async function verifyJwt(token, secret) {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) throw httpError("Invalid session token.", 401);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), new TextEncoder().encode(`${header}.${body}`));
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body)));
  if (!valid || !payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) throw httpError("Invalid or expired session token.", 401);
  return payload;
}
