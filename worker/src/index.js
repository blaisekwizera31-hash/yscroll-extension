const ALLOWED_ORIGINS = new Set(["https://doomshield.pages.dev"]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers });

    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        return json(await registerWithEmail(request, env), 200, headers);
      }
      if (request.method === "POST" && url.pathname === "/api/usage/sync") {
        const user = await requireUser(request, env);
        return json(await syncUsage(request, env, user.id), 200, headers);
      }
      if (request.method === "GET" && url.pathname === "/api/leaderboard") {
        await requireUser(request, env);
        const { results } = await env.DB.prepare(`
          SELECT u.id, u.name, u.avatar_url,
            COALESCE(SUM(s.time_saved_seconds), 0) AS time_saved_seconds
          FROM users u
          LEFT JOIN usage_stats s ON s.user_id = u.id
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

async function registerWithEmail(request, env) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.username || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw httpError("Enter a valid email address.", 400);
  }
  if (name.length < 2 || name.length > 50) {
    throw httpError("Username must be between 2 and 50 characters.", 400);
  }

  await env.DB.prepare(`
    INSERT INTO users (id, email, name, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name
  `).bind(crypto.randomUUID(), email, name, null).run();

  const user = await env.DB.prepare(
    "SELECT id, email, name, avatar_url FROM users WHERE email = ?"
  ).bind(email).first();

  return {
    session_token: await signJwt({ sub: user.id, email: user.email }, env.JWT_SECRET),
    user,
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
