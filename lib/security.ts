import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export function hashPublicToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function requestFingerprint(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${scope}:${ip}`).digest("hex");
}

export function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return process.env.NODE_ENV !== "production";
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("consume_rate_limit", {
    rate_key: key, rate_limit: limit, window_seconds: windowSeconds
  });
  if (error) {
    console.error("[security] rate limit unavailable", { code: error.code });
    return false;
  }
  return data === true;
}
