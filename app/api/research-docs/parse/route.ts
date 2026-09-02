import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a DOCX, PDF, or TXT research document." }, { status: 400 });
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
      const pdf = new PDFParse({ data: buffer });
      const result = await pdf.getText();
      await pdf.destroy();
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
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not parse this research document."
    }, { status: 500 });
  }
}
