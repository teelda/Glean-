import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formAccess, canReadResponses } from "@/lib/form-workspace";
import { apiError, HttpError } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("formId"));
    const { db, role } = await formAccess(id, user.id);
    if (!canReadResponses(role)) throw new HttpError("Your role cannot access respondent data.", 403);
    const { data, error } = await db.rpc("form_response_stats", { target_form: id });
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
