import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./http";
import { randomBytes } from "node:crypto";
import { hashPublicToken } from "./security";
import { formSaveSchema } from "./form-validation";
import type { z } from "zod";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError("Cloud storage is unavailable. Please try again later.", 503);
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
}
export const FORM_FIELDS = "id,owner_id,name,slug,sections,context,status,version,expires_at,updated_at,created_at";
export type FormRole = "owner" | "editor" | "reviewer" | "viewer";
export function canEdit(role: FormRole) { return role === "owner" || role === "editor"; }
export function canReadResponses(role: FormRole) { return role !== "reviewer"; }

export async function formAccess(formId: string, userId: string) {
  const db = adminClient();
  const { data: form, error } = await db.from("research_forms").select(FORM_FIELDS).eq("id", formId).maybeSingle();
  if (error) throw error;
  if (!form) throw new HttpError("This form is unavailable.", 404);
  let role: FormRole = "owner";
  if (form.owner_id !== userId) {
    const { data: member, error: memberError } = await db.from("form_members").select("role").eq("form_id", formId).eq("user_id", userId).maybeSingle();
    if (memberError) throw memberError;
    if (!member) throw new HttpError("This form is unavailable.", 404);
    role = member.role as FormRole;
  }
  return { db, form, role };
}

export async function saveForm(input: z.infer<typeof formSaveSchema>, userId: string) {
  const db = adminClient();
  let version = 1, role: FormRole = "owner";
  let current: Awaited<ReturnType<typeof formAccess>>["form"] | null = null;
  if (input.formId) {
    const access = await formAccess(input.formId, userId);
    current = access.form; role = access.role;
    if (!canEdit(role) || (input.publish && role !== "owner")) throw new HttpError("You do not have permission to make this change.", 403);
    if (input.version !== current.version) throw new HttpError("Someone saved a newer version. Reload the saved form before editing again; your current text is still here.", 409);
    version = current.version + 1;
  }
  const values: Record<string, unknown> = {
    name: input.name, slug: input.slug, sections: input.sections, context: input.context ?? {}, version,
    updated_at: new Date().toISOString()
  };
  let token: string | undefined;
  if (input.publish) {
    if (!input.sections.some(s => s.questions.length)) throw new HttpError("Add a question before publishing.");
    values.status = "published"; values.published_sections = input.sections; values.published_name = input.name;
    values.expires_at = new Date(Date.now() + input.expiresDays * 86400000).toISOString();
    // Updates retain the existing link. A replacement link is an explicit owner action.
    if (!current || current.status !== "published") {
      token = randomBytes(24).toString("base64url");
      values.public_token_hash = hashPublicToken(token); values.public_token = null;
    }
  }
  const query = current
    ? db.from("research_forms").update(values).eq("id", current.id).eq("version", input.version!)
    : db.from("research_forms").insert({ ...values, owner_id: userId, status: input.publish ? "published" : "draft" });
  const { data, error } = await query.select(FORM_FIELDS).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError("Someone saved a newer version. Reload before saving again.", 409);
  return { ...data, role, token };
}
