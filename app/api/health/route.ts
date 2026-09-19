import { NextResponse } from "next/server";
import { adminClient } from "@/lib/form-workspace";

export async function GET() {
  let configured = false;
  try {
    const { error } = await adminClient().from("research_forms").select("id").limit(1);
    configured = !error;
  } catch { configured = false; }
  return NextResponse.json(
    { status: configured ? "ok" : "degraded", storage: configured ? "connected" : "unavailable" },
    { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
