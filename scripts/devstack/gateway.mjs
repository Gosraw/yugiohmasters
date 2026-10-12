#!/usr/bin/env node
// Local Supabase-compatible API on http://127.0.0.1:54321 for the
// devstack database (scripts/devstack/db.mjs):
//
//   /rest/v1/*  -> PostgREST (spawned here, port 54330)
//   /auth/v1/*  -> a minimal GoTrue stand-in implemented below
//                  (signup, password + refresh_token grants, user,
//                  logout, admin delete) - just what supabase-js and
//                  @supabase/ssr call in this app.
//
// Prints the env vars to point the app at it. Never talks to
// production.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import postgres from "postgres";

import { DB_URL, start as startDb } from "./db.mjs";
import { ANON_KEY, GATEWAY_PORT, JWT_SECRET, SERVICE_ROLE_KEY, signJwt, verifyJwt } from "./keys.mjs";

const POSTGREST_PORT = 54330;
const ACCESS_TOKEN_TTL = 3600;
const ROOT = path.resolve(import.meta.dirname, "../..");

const sql = postgres(DB_URL, {
  max: 4,
  onnotice: () => {},
});

function userJson(row) {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    confirmed_at: row.email_confirmed_at,
    last_sign_in_at: row.last_sign_in_at,
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    is_anonymous: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function issueSession(row) {
  const now = Math.floor(Date.now() / 1000);
  const refreshToken = randomBytes(24).toString("hex");

  await sql`insert into auth.refresh_tokens (token, user_id) values (${refreshToken}, ${row.id})`;
  await sql`update auth.users set last_sign_in_at = now() where id = ${row.id}`;

  const accessToken = signJwt({
    aud: "authenticated",
    exp: now + ACCESS_TOKEN_TTL,
    iat: now,
    iss: `http://127.0.0.1:${GATEWAY_PORT}/auth/v1`,
    sub: row.id,
    email: row.email,
    phone: "",
    role: "authenticated",
    aal: "aal1",
    session_id: randomBytes(16).toString("hex"),
    is_anonymous: false,
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
  });

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL,
    expires_at: now + ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    user: userJson(row),
  };
}

function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function authError(res, status, code, message) {
  send(res, status, {
    code: status,
    error_code: code,
    msg: message,
    error: code,
    error_description: message,
  });
}

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString();

  return text ? JSON.parse(text) : {};
}

function bearer(req) {
  const header = req.headers.authorization ?? "";

  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

async function handleAuth(req, res, url) {
  const route = url.pathname.replace(/^\/auth\/v1/, "");

  if (req.method === "GET" && (route === "/health" || route === "/settings")) {
    return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  }

  if (req.method === "GET" && route === "/.well-known/jwks.json") {
    return send(res, 200, { keys: [] });
  }

  if (req.method === "POST" && route === "/signup") {
    const body = await readBody(req);
    const email = String(body.email ?? "").toLowerCase();

    const [exists] = await sql`select 1 from auth.users where email = ${email}`;

    if (exists) {
      return authError(res, 422, "user_already_exists", "User already registered");
    }

    try {
      const [row] = await sql`
        insert into auth.users (email, encrypted_password, raw_user_meta_data)
        values (${email}, crypt(${String(body.password)}, gen_salt('bf')), ${sql.json(body.data ?? {})})
        returning *
      `;

      return send(res, 200, await issueSession(row));
    } catch (error) {
      return authError(res, 500, "unexpected_failure", `Database error saving new user: ${error.message}`);
    }
  }

  if (req.method === "POST" && route === "/token") {
    const grant = url.searchParams.get("grant_type");
    const body = await readBody(req);

    if (grant === "password") {
      const [row] = await sql`
        select * from auth.users
        where email = ${String(body.email ?? "").toLowerCase()}
          and encrypted_password = crypt(${String(body.password ?? "")}, encrypted_password)
      `;

      if (!row) {
        return authError(res, 400, "invalid_credentials", "Invalid login credentials");
      }

      return send(res, 200, await issueSession(row));
    }

    if (grant === "refresh_token") {
      const [token] = await sql`
        update auth.refresh_tokens set revoked = true
        where token = ${String(body.refresh_token ?? "")} and not revoked
        returning user_id
      `;

      if (!token) {
        return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      }

      const [row] = await sql`select * from auth.users where id = ${token.user_id}`;

      return send(res, 200, await issueSession(row));
    }

    return authError(res, 400, "unsupported_grant_type", `Unsupported grant_type ${grant}`);
  }

  const claims = verifyJwt(bearer(req));

  if (req.method === "GET" && route === "/user") {
    if (!claims?.sub) {
      return authError(res, 401, "bad_jwt", "invalid JWT");
    }

    const [row] = await sql`select * from auth.users where id = ${claims.sub}`;

    return row ? send(res, 200, userJson(row)) : authError(res, 404, "user_not_found", "User not found");
  }

  if (req.method === "POST" && route === "/logout") {
    if (claims?.sub) {
      await sql`update auth.refresh_tokens set revoked = true where user_id = ${claims.sub}`;
    }

    res.writeHead(204);

    return res.end();
  }

  const adminUser = route.match(/^\/admin\/users\/([0-9a-f-]{36})$/);

  if (req.method === "DELETE" && adminUser) {
    if (claims?.role !== "service_role") {
      return authError(res, 403, "not_admin", "User not allowed");
    }

    await sql`delete from auth.users where id = ${adminUser[1]}`;

    return send(res, 200, {});
  }

  return authError(res, 404, "not_found", `devstack auth: ${req.method} ${route} not implemented`);
}

function proxyRest(req, res, url) {
  const headers = { ...req.headers };

  // Kong's behaviour: no Authorization header -> use the apikey.
  if (!headers.authorization && headers.apikey) {
    headers.authorization = `Bearer ${headers.apikey}`;
  }

  delete headers.host;

  const upstream = http.request({
    host: "127.0.0.1",
    port: POSTGREST_PORT,
    method: req.method,
    path: url.pathname.replace(/^\/rest\/v1/, "") + url.search,
    headers,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on("error", (error) => send(res, 502, { message: `PostgREST unavailable: ${error.message}` }));
  req.pipe(upstream);
}

function startPostgrest() {
  const dir = path.join(ROOT, ".devstack");

  mkdirSync(dir, { recursive: true });

  const config = path.join(dir, "postgrest.conf");

  writeFileSync(config, [
    `db-uri = "postgres://authenticator:devstack@127.0.0.1:54322/postgres"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `jwt-secret = "${JWT_SECRET}"`,
    `server-host = "127.0.0.1"`,
    `server-port = ${POSTGREST_PORT}`,
    `db-max-rows = 1000`,
    `db-channel-enabled = true`,
  ].join("\n"));

  const child = spawn("/opt/homebrew/bin/postgrest", [config], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  process.on("exit", () => child.kill());

  return child;
}

startDb();
startPostgrest();

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${GATEWAY_PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    });

    return res.end();
  }

  try {
    if (url.pathname.startsWith("/rest/v1")) {
      return proxyRest(req, res, url);
    }

    if (url.pathname.startsWith("/auth/v1")) {
      return await handleAuth(req, res, url);
    }

    send(res, 404, { message: "devstack: unknown path" });
  } catch (error) {
    send(res, 500, { message: error.message });
  }
}).listen(GATEWAY_PORT, "127.0.0.1", () => {
  console.log(`devstack API on http://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}`);
  console.log(`SUPABASE_SECRET_KEY=${SERVICE_ROLE_KEY}`);
});
