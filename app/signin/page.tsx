"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, MailCheck, Sprout } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ERROR_COPY: Record<string, string> = {
  expired: "That link has expired or was already used. Request a new one below.",
  "missing-code": "That link was incomplete. Request a new one below.",
  "not-configured": "Sign-in is not connected yet. Add the Supabase keys and redeploy."
};

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const linkError = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(linkError ? ERROR_COPY[linkError] ?? "Could not sign you in." : "");

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Sign-in is not connected yet. Add the Supabase keys and redeploy.");
      return;
    }
    setStatus("sending");
    setError("");
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` }
    });
    if (sendError) {
      setStatus("idle");
      setError(sendError.message);
      return;
    }
    setStatus("sent");
  };

  if (status === "sent") {
    return <div className="signin-card">
      <span className="signin-mark signin-mark-sent"><MailCheck size={22}/></span>
      <h1>Check your email</h1>
      <p>We sent a sign-in link to <b>{email}</b>. It expires in an hour and can be used once.</p>
      <button className="text-button" onClick={() => setStatus("idle")}>Use a different email</button>
    </div>;
  }

  return <div className="signin-card">
    <span className="signin-mark"><Sprout size={22}/></span>
    <h1>Sign in to Glean</h1>
    <p>Enter your email and we&rsquo;ll send you a link. No password to remember.</p>
    <form onSubmit={send} className="signin-form">
      <label>
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="you@company.com"
        />
      </label>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={status === "sending" || !email}>
        {status === "sending" ? "Sending…" : "Send sign-in link"}
        {status === "sending" ? null : <ArrowRight size={17}/>}
      </button>
    </form>
    <small className="signin-foot">Your research stays in your workspace. Respondents never need an account.</small>
  </div>;
}

export default function SignInPage() {
  return <main className="signin-view">
    <Suspense fallback={<div className="signin-card"><h1>Sign in to Glean</h1></div>}>
      <SignInForm/>
    </Suspense>
  </main>;
}
