import { NextResponse } from "next/server";
import { z } from "zod";
import { UnauthorizedError } from "./auth";

export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function readJson(request: Request, max = 1_000_000) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("Request is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new HttpError("This request is too large. Reduce the content and try again.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError("Glean could not read this request. Refresh and try again."); }
}

export function apiError(error: unknown) {
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Check the information and try again." }, { status: 400 });
  console.error("[api] request failed", { type: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ error: "Something went wrong. Your changes have not been saved. Please try again." }, { status: 500 });
}
