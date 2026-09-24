import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { adminClient, formAccess, FORM_FIELDS, saveForm, canReadResponses } from "@/lib/form-workspace";
import { formSaveSchema } from "@/lib/form-validation";
import { consumeRateLimit, hasTrustedOrigin, hashPublicToken } from "@/lib/security";
import { randomBytes } from "node:crypto";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const id = params.get("formId");
    if (id) {
      z.string().uuid().parse(id);
      const { db, form, role } = await formAccess(id, user.id);
      const { data: comments, error } = await db.from("form_comments").select("id,author_id,body,created_at").eq("form_id", id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const { data: members } = role === "owner" ? await db.from("form_members").select("user_id,role").eq("form_id", id) : { data: [] };
      const { data: invitations } = role === "owner" ? await db.from("form_invitations").select("id,email,role,expires_at,accepted_at,accepted_by_user_id,revoked_at").eq("form_id", id).order("created_at", { ascending: false }).limit(100) : { data: [] };
      const memberRows = (members ?? []).map(member => ({
        ...member,
        email: invitations?.find(invitation => invitation.accepted_by_user_id === member.user_id)?.email ?? null
      }));
      return NextResponse.json({ form: { ...form, role }, comments, members: memberRows, invitations }, { headers: { "Cache-Control": "no-store" } });
    }
    const db = adminClient();
    const { data: memberships, error: memberError } = await db.from("form_members").select("form_id,role").eq("user_id", user.id).limit(200);
    if (memberError) throw memberError;
    const { data: own, error } = await db.from("research_forms").select(FORM_FIELDS).eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    const { data: shared, error: sharedError } = memberships?.length ? await db.from("research_forms").select(FORM_FIELDS).in("id", memberships.map(m => m.form_id)).limit(200) : { data: [], error: null };
    if (sharedError) throw sharedError;
    return NextResponse.json({ forms: [...(own ?? []).map(f => ({ ...f, role: "owner" })), ...(shared ?? []).map(f => ({ ...f, role: memberships?.find(m => m.form_id === f.id)?.role }))] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

const actionSchema = z.object({
  action: z.enum(["close", "replace-link", "comment", "member-role", "remove-member", "revoke-invite"]),
  formId: z.string().uuid(), version: z.number().int().positive().optional(),
  body: z.string().trim().min(1).max(2000).optional(),
  userId: z.string().uuid().optional(), invitationId: z.string().uuid().optional(),
  role: z.enum(["editor", "reviewer", "viewer"]).optional()
});

export async function POST(request: Request) {
  try {
    if (!hasTrustedOrigin(request)) throw new HttpError("Request origin is not allowed.", 403);
    const user = await requireUser();
    if (!await consumeRateLimit(`form-workspace:${user.id}`, 180, 3600)) throw new HttpError("Too many changes. Please wait before trying again.", 429);
    const raw = await readJson(request);
    if (!raw.action) return NextResponse.json({ form: await saveForm(formSaveSchema.parse(raw), user.id) });
    const input = actionSchema.parse(raw);
    const { db, role, form } = await formAccess(input.formId, user.id);
    if (input.action === "comment") {
      if (role === "viewer" || !input.body) throw new HttpError("You do not have permission to comment.", 403);
      const { error } = await db.from("form_comments").insert({ form_id: form.id, author_id: user.id, body: input.body });
      if (error) throw error;
    } else {
      if (role !== "owner") throw new HttpError("Only the owner can change access or publishing.", 403);
      if (input.action === "member-role" || input.action === "remove-member") {
        if (!input.userId || input.userId === user.id) throw new HttpError("Select a collaborator.");
        if (input.action === "member-role" && !input.role) throw new HttpError("Choose a role.");
        const query = input.action === "remove-member" ? db.from("form_members").delete() : db.from("form_members").update({ role: input.role });
        const { error } = await query.eq("form_id", form.id).eq("user_id", input.userId);
        if (error) throw error;
      } else if (input.action === "revoke-invite") {
        if (!input.invitationId) throw new HttpError("Choose an invitation.");
        const { error } = await db.from("form_invitations").update({ revoked_at: new Date().toISOString() }).eq("form_id", form.id).eq("id", input.invitationId);
        if (error) throw error;
      } else {
        if (input.version !== form.version) throw new HttpError("Reload the latest form before changing its link.", 409);
        const token = input.action === "replace-link" ? randomBytes(24).toString("base64url") : undefined;
        if (token && form.status !== "published") throw new HttpError("Publish this form first.");
        const values = token ? { public_token_hash: hashPublicToken(token), public_token: null, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() } : { status: "draft", public_token_hash: null, public_token: null };
        const { data, error } = await db.from("research_forms").update({ ...values, version: form.version + 1, updated_at: new Date().toISOString() }).eq("id", form.id).eq("version", input.version).select(FORM_FIELDS).maybeSingle();
        if (error) throw error;
        if (!data) throw new HttpError("The form changed. Reload and try again.", 409);
        return NextResponse.json({ form: { ...data, role, token } });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
