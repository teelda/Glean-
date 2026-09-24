const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character] ?? character));

const roleCopy = {
  editor: "edit the form and read responses",
  reviewer: "review the form and leave notes",
  viewer: "read the form and responses"
} as const;

export function formInvitationEmail(input: { formName: string; role: keyof typeof roleCopy; inviteUrl: string; note?: string }) {
  const formName = escapeHtml(input.formName);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const note = input.note?.trim();
  const permission = roleCopy[input.role];
  const noteBlock = note ? `<div style="margin:24px 0;padding:16px 18px;border-radius:12px;background:#f6f5ff;color:#282743"><strong>Note from the owner</strong><p style="margin:8px 0 0">${escapeHtml(note)}</p></div>` : "";

  return {
    subject: `Join ${input.formName} in Glean`,
    text: `You have been invited to collaborate on ${input.formName} in Glean.\n\nAs ${input.role}, you can ${permission}.\n${note ? `\nNote from the owner:\n${note}\n` : ""}\nOpen invitation: ${input.inviteUrl}\n\nSign in with the email address that received this invitation. The invitation expires in seven days.`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#111038"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:40px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#ffffff;border:1px solid #e5e3dc;border-radius:18px"><tr><td style="padding:34px"><div style="font-size:15px;font-weight:700;color:#111038">Glean <span style="font-weight:400;color:#737187">by Folde</span></div><h1 style="font-size:28px;line-height:1.2;margin:30px 0 12px">You&rsquo;re invited to collaborate</h1><p style="font-size:16px;line-height:1.6;margin:0;color:#525066">Join <strong>${formName}</strong> as a ${input.role}. You can ${permission}.</p>${noteBlock}<p style="margin:28px 0"><a href="${inviteUrl}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:#111038;color:#ffffff;text-decoration:none;font-weight:700">Open form in Glean</a></p><p style="font-size:13px;line-height:1.5;color:#737187;margin:0">Sign in with the email address that received this invitation. This link expires in seven days.</p></td></tr></table></td></tr></table></body></html>`
  };
}
