import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { formAccess } from "@/lib/form-workspace";
import { apiError, HttpError, readJson } from "@/lib/http";
import { consumeRateLimit, hasTrustedOrigin, hashPublicToken } from "@/lib/security";
import { formInvitationEmail } from "@/lib/invite-email";

export async function POST(request: Request) {
  try {
    if (!hasTrustedOrigin(request)) throw new HttpError("Request origin is not allowed.", 403);
    const user = await requireUser();
    if (!await consumeRateLimit(`invite:${user.id}`, 20, 3600)) throw new HttpError("Too many invitations. Try again later.", 429);
    const input = z.object({ formId: z.string().uuid(), to: z.string().email().max(254).transform(s => s.toLowerCase()), role: z.enum(["editor", "reviewer", "viewer"]), note: z.string().max(2000).default("") }).parse(await readJson(request, 10000));
    const { db, form, role } = await formAccess(input.formId, user.id);
    if (role !== "owner") throw new HttpError("Only the owner can invite collaborators.", 403);
    if (input.to === user.email?.toLowerCase()) throw new HttpError("You already own this form.");
    await db.from("form_invitations").update({ revoked_at: new Date().toISOString() })
      .eq("form_id", form.id).eq("email", input.to).is("accepted_at", null).is("revoked_at", null);
    const token = randomBytes(24).toString("base64url");
    const { data, error } = await db.from("form_invitations").insert({ form_id: form.id, email: input.to, role: input.role, token_hash: hashPublicToken(token), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }).select("id").single();
    if (error) throw error;
    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const inviteUrl = `${base}/invite?token=${token}`;
    const email = formInvitationEmail({ formName: form.name, role: input.role, inviteUrl, note: input.note });
    let emailSent = false;
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `invite-${data.id}` },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: input.to, subject: email.subject, text: email.text, html: email.html })
        });
        emailSent = response.ok;
      } catch { /* Invitation remains usable if email delivery is unavailable. */ }
    }
    return NextResponse.json({ inviteUrl, emailSent, message: emailSent ? "Invitation emailed." : "Invitation created. Email delivery is unavailable; copy the invitation link and share it with this teammate." });
  } catch (error) { return apiError(error); }
}
