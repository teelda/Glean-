import { NextResponse } from "next/server";
import { backendMode, getPublicForm } from "@/lib/form-backend";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await getPublicForm(token);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  return NextResponse.json({ form, mode: backendMode() });
}
