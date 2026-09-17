import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
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
      parser = "docx";
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (lower.endsWith(".pdf")) {
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
