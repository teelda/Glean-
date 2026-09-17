import { NextResponse } from "next/server";
import { z } from "zod";

const inviteSchema = z.object({
  to: z.string().email(),
  formName: z.string().min(1),
  note: z.string().optional().default(""),
  shareUrl: z.string().optional().default(""),
  status: z.enum(["draft", "published"]).default("draft")
});

export async function POST(request: Request) {
  try {
    const payload = inviteSchema.parse(await request.json());
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || "Glean <onboarding@resend.dev>";

    if (!apiKey) {
      return NextResponse.json({
        error: "Email invitations are not available yet because email has not been connected to this workspace. You can copy the form preview link and share it manually for now.",
        code: "EMAIL_NOT_CONFIGURED"
      }, { status: 503 });
    }

    const reviewUrl = payload.shareUrl || process.env.NEXT_PUBLIC_APP_URL || "";
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#11113d">
        <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#77788d">Glean review invite</p>
        <h1 style="font-size:24px;line-height:1.2;margin:0 0 12px">Review ${escapeHtml(payload.formName)}</h1>
        <p style="font-size:15px;line-height:1.6;color:#4f5066">You’ve been invited to review a research form before it is shared with respondents.</p>
        ${payload.note ? `<blockquote style="border-left:4px solid #f5c842;margin:22px 0;padding:10px 0 10px 14px;color:#292942">${escapeHtml(payload.note)}</blockquote>` : ""}
        ${reviewUrl ? `<p><a href="${escapeAttribute(reviewUrl)}" style="display:inline-block;background:#11113d;color:#fff;text-decoration:none;border-radius:12px;padding:12px 16px;font-weight:700">Open form</a></p>` : `<p style="font-size:14px;color:#6e6f83">This form is still a draft. Ask the researcher to publish a review link when ready.</p>`}
        <p style="font-size:12px;line-height:1.5;color:#77788d;margin-top:28px">Powered by Folde.</p>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: `Review ${payload.formName} in Glean`,
        html
      })
    });

    const result = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      console.error("[forms/review-invite] email provider rejected invite", {
        status: resendResponse.status,
        message: result.message ?? "Unknown provider error"
      });
      return NextResponse.json({
        error: "Glean could not send that email. Check the address and try again. If it still fails, copy the preview link and share it manually.",
        code: "EMAIL_SEND_FAILED"
      }, { status: 502 });
    }

    return NextResponse.json({ id: result.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send invite" }, { status: 400 });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character] ?? character));
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
