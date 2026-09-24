"use client";
import { useEffect, useState } from "react";

export function FormTeam({ formId, role }: { formId: string; role: string }) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("reviewer");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<{ comments: { id: string; body: string; created_at: string }[]; members: { user_id: string; role: string; email: string | null }[]; invitations: { id: string; email: string; role: string; accepted_at: string | null; revoked_at: string | null }[] }>({ comments: [], members: [], invitations: [] });
  async function refresh() {
    const response = await fetch(`/api/forms/workspace?formId=${formId}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setDetails(result);
  }
  useEffect(() => {
    if (!formId) return;
    refresh().catch(error => setMessage(error.message));
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [formId]);
  async function action(payload: Record<string, unknown>, endpoint = "/api/forms/workspace") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, formId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(result.message ?? "Saved.");
      if (result.inviteUrl) setLink(result.inviteUrl);
      if (payload.action === "comment") setNote("");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  if (!formId) return <p>Save this form to invite teammates and leave review notes.</p>;
  return <div className="review-flow-card">
    <p>Your access: <b>{role}</b>. Editors can save questions; reviewers can leave notes; viewers can read the form and responses. Only the owner publishes and manages access.</p>
    {role === "owner" && <>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com"/></label>
      <label>Access<select value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="editor">Editor — edit and read responses</option><option value="reviewer">Reviewer — form and review notes only</option><option value="viewer">Viewer — form and responses</option></select></label>
      <button className="outline-button" disabled={busy || !email.trim()} onClick={() => action({ to: email, role: inviteRole, note: "" }, "/api/forms/review-invite")}>Invite teammate</button>
      {link && <label>Invitation link<input readOnly value={link} onFocus={e => e.target.select()}/><small>Only the invited email can accept. Expires in seven days.</small></label>}
      {details.members.length > 0 && <div className="team-list-heading"><b>Members</b><small>Changes apply the next time Glean checks access.</small></div>}
      {details.members.map(member => <div className="review-notes team-member-row" key={member.user_id}><p><b>{member.email ?? `Member ${member.user_id.slice(0, 8)}`}</b><small>Active collaborator</small></p><label>Role<select disabled={busy} value={member.role} onChange={e => action({ action: "member-role", userId: member.user_id, role: e.target.value })}><option value="editor">Editor</option><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option></select></label><button className="text-button" disabled={busy} onClick={() => action({ action: "remove-member", userId: member.user_id })}>Remove access</button></div>)}
      {details.invitations.some(i => !i.accepted_at && !i.revoked_at) && <div className="team-list-heading"><b>Pending invitations</b><small>Invitations expire after seven days.</small></div>}
      {details.invitations.filter(i => !i.accepted_at && !i.revoked_at).map(invite => <div className="review-notes" key={invite.id}><p>{invite.email} · {invite.role} · Pending</p><button className="text-button" disabled={busy} onClick={() => action({ action: "revoke-invite", invitationId: invite.id })}>Revoke invitation</button></div>)}
    </>}
    {role !== "viewer" && <><label>Review note<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder="What should the team review?"/></label><button className="outline-button" disabled={busy || !note.trim()} onClick={() => action({ action: "comment", body: note })}>Add note</button></>}
    {message && <p role="status">{message}</p>}
    {details.comments.map(comment => <div className="review-notes" key={comment.id}><p>{comment.body}</p><small>{new Date(comment.created_at).toLocaleString()}</small></div>)}
  </div>;
}
