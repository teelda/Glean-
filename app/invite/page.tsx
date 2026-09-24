"use client";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function InvitationPage() {
  const [message, setMessage] = useState("Checking your invitation…");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const token = useMemo(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? "", []);
  const signInUrl = `/signin?next=${encodeURIComponent(`/invite?token=${token}`)}`;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!token) {
      setSignedIn(false);
      setMessage("This invitation link is incomplete. Ask the owner to send a new one.");
      return;
    }
    if (!supabase) {
      setSignedIn(false);
      setMessage("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const present = Boolean(data.user);
      setSignedIn(present);
      setMessage(present
        ? "You are signed in. Accept to add this form to your workspace."
        : "Sign in with the email address that received this invitation. You will return here automatically.");
    });
    return () => { active = false; };
  }, [token]);

  async function accept() {
    if (!signedIn) {
      window.location.assign(signInUrl);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/forms/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (response.status === 401) {
        window.location.assign(signInUrl);
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not accept this invitation.");
      window.location.assign(`/?form=${result.formId}#forms`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not accept the invitation."); setBusy(false); }
  }
  return <main className="signin-view"><section className="signin-card"><h1>Join the research</h1><p role="status">{message}</p><button className="primary-button" disabled={busy || signedIn === null || !token} onClick={accept}>{busy ? "Opening…" : signedIn ? "Accept invitation" : "Sign in to accept"}</button><p><a href="/">Return to Glean</a></p></section></main>;
}
