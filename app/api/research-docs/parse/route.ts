import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { consumeRateLimit, hasTrustedOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const user = await requireUser();
    if (!await consumeRateLimit(`parse:${user.id}`, 30, 3600)) {
      return NextResponse.json({ error: "Too many document imports. Please try again later." }, { status: 429 });
    }
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a DOCX, PDF, or TXT research document." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({
        error: "That document is larger than 10 MB. Split it into smaller files and upload them separately."
      }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const lower = file.name.toLowerCase();
    let text = "";
    let parser = "plain-text";

    if (lower.endsWith(".docx")) {
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        return NextResponse.json({ error: "That file is not a valid DOCX. Save it as a fresh Word document and try again." }, { status: 415 });
      }
      parser = "docx";
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (lower.endsWith(".pdf")) {
      if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return NextResponse.json({ error: "That file is not a valid PDF. Export it as a fresh PDF and try again." }, { status: 415 });
      }
      parser = "pdf";
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (lower.endsWith(".txt")) {
      text = buffer.toString("utf8");
    } else {
      return NextResponse.json({ error: "Supported formats: DOCX, PDF, TXT." }, { status: 415 });
    }

    const normalized = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
    return NextResponse.json({
      fileName: file.name,
      parser,
      characters: normalized.length,
      text: normalized,
      warning: normalized.length < 80 ? "The document parsed, but very little text was found. It may be scanned, image-based, or mostly tables." : null
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[research-docs/parse] document extraction failed", { detail });

    const friendlyError = /zip|central directory|docx|office open xml/i.test(detail)
      ? "Glean could not open that DOCX. It may be damaged, password-protected, or a different file type renamed as .docx. Open it in Word or Google Docs, save a fresh DOCX, and try again."
      : /password|encrypted/i.test(detail)
        ? "That document appears to be password-protected. Remove the password and upload it again."
        : "Glean could not read that document. Try saving a fresh DOCX, a text-based PDF, or a TXT file and upload it again.";

    return NextResponse.json({ error: friendlyError }, { status: 500 });
  }
}
