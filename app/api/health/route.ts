import { NextResponse } from "next/server";

export async function GET() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return NextResponse.json(
    { status: configured ? "ok" : "degraded", storage: configured ? "connected" : "unavailable" },
    { status: configured ? 200 : 503 }
  );
}
