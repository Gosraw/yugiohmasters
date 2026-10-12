// Shared devstack JWT secret + API keys (anon / service_role), used by
// gateway.mjs, dev.mjs and the test bots. Local-only values.

import { createHmac, timingSafeEqual } from "node:crypto";

export const GATEWAY_PORT = 54321;
export const JWT_SECRET = "devstack-jwt-secret-at-least-32-characters-long";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");

  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token) {
  const [header, body, signature] = String(token ?? "").split(".");

  if (!header || !body || !signature) {
    return null;
  }

  const expected = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, "base64url");

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString());

  if (payload.exp && payload.exp < Date.now() / 1000) {
    return null;
  }

  return payload;
}

const FAR_FUTURE = 4102444800;

export const ANON_KEY = signJwt({ iss: "supabase-devstack", role: "anon", exp: FAR_FUTURE });
export const SERVICE_ROLE_KEY = signJwt({ iss: "supabase-devstack", role: "service_role", exp: FAR_FUTURE });
