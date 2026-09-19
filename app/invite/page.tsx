"use client";
import { useState } from "react";

export default function InvitationPage() {
  const [message, setMessage] = useState("Sign in with the email address that received this invitation, then accept to open the shared form.");
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      const response = await fetch("/api/forms/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign(`/?form=${result.formId}#forms`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not accept the invitation."); setBusy(false); }
  }
  return <main className="signin-view"><section className="signin-card"><h1>Join the research</h1><p role="status">{message}</p><button className="primary-button" disabled={busy} onClick={accept}>{busy ? "Opening…" : "Accept invitation"}</button><p><a href="/">Return to Glean</a></p></section></main>;
}
