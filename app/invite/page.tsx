"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, FileText, MessageSquareText, Sprout } from "lucide-react";
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
  return <main className="signin-view invite-view">
    <section className="signin-story" aria-label="Glean collaboration">
      <a className="signin-brand" href="/"><span><Sprout size={22}/></span><b>Glean</b><small>Powered by Folde</small></a>
      <div><span className="eyebrow">TEAM REVIEW</span><h2>Research is stronger when the right people can challenge it.</h2><p>This private invitation adds one shared form to your own Glean workspace.</p></div>
      <ul><li><FileText size={17}/><span><b>One shared form</b><small>Your other workspace content stays separate.</small></span></li><li><MessageSquareText size={17}/><span><b>Review in context</b><small>Edit or comment according to the access the owner selected.</small></span></li></ul>
    </section>
    <section className="signin-panel"><div className="signin-card invite-card">
      <span className="signin-mark"><Check size={21}/></span><span className="eyebrow">FORM INVITATION</span><h1>Join this research workspace</h1><p role="status">{message}</p>
      <div className="invite-expectation"><b>What happens next</b><p>Sign in with the invited address, accept access, and Glean will open the shared form.</p></div>
      <button className="primary-button" disabled={busy || signedIn === null || !token} onClick={accept}>{busy ? "Opening…" : signedIn ? "Accept and open form" : "Sign in to continue"}{!busy&&<ArrowRight size={17}/>}</button>
      <a className="invite-return" href="/">Return to Glean</a>
    </div></section>
  </main>;
}
