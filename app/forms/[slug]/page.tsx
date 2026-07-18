"use client";

import { useState } from "react";
import { Check, LockKeyhole, SendHorizontal, Sprout } from "lucide-react";

export default function PublishedResearchForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <main className="respondent-page">
      <section className="respondent-card respondent-success">
        <span className="respondent-brand"><Sprout size={26}/><b>Glean</b><small>Powered by Folde</small></span>
        <div className="success-mark"><Check size={28}/></div>
        <h1>Thank you — your response was received.</h1>
        <p>Your answers will be reviewed by the researcher and used only as part of this feminine wellness study.</p>
      </section>
    </main>;
  }

  return <main className="respondent-page">
    <section className="respondent-card">
      <header>
        <span className="respondent-brand"><Sprout size={26}/><b>Glean</b><small>Powered by Folde</small></span>
        <span className="respondent-badge">Anonymous research form</span>
      </header>
      <div className="respondent-hero">
        <span className="eyebrow">FEMININE WELLNESS RESEARCH</span>
        <h1>Help us understand what makes feminine wellness support feel safe, useful, and trustworthy.</h1>
        <p>This short form should take about 4 minutes. Please avoid sharing medical details you are not comfortable including.</p>
      </div>
      <form className="respondent-form" onSubmit={event => { event.preventDefault(); setSubmitted(true); }}>
        <label>Which best describes your current relationship with feminine wellness products or services?
          <select required defaultValue="">
            <option value="" disabled>Select one</option>
            <option>Actively use them</option>
            <option>Exploring options</option>
            <option>Curious but unsure</option>
            <option>Prefer not to say</option>
          </select>
        </label>
        <label>What usually makes a feminine wellness product feel trustworthy or safe to you?
          <textarea required rows={4} placeholder="For example: language, privacy, expert backing, community stories, packaging, tone..."/>
        </label>
        <label>What feels confusing, uncomfortable, or missing when researching feminine wellness options?
          <textarea required rows={4} placeholder="Share as much or as little as feels comfortable."/>
        </label>
        <label>How comfortable would you feel sharing sensitive wellness context in a digital product?
          <select required defaultValue="">
            <option value="" disabled>Select a rating</option>
            <option>1 — Not comfortable</option>
            <option>2</option>
            <option>3 — Depends on the product</option>
            <option>4</option>
            <option>5 — Very comfortable</option>
          </select>
        </label>
        <div className="respondent-privacy"><LockKeyhole size={18}/><span>This prototype does not ask for your name or email. In the production version, researchers will configure consent and retention before publishing.</span></div>
        <button className="primary-button" type="submit">Submit response<SendHorizontal size={16}/></button>
      </form>
    </section>
  </main>;
}
