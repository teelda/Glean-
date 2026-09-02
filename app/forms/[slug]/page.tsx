"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, LockKeyhole, SendHorizontal, Sprout } from "lucide-react";

type PublicQuestion = {
  id: string;
  text: string;
  type: "open" | "single" | "scale";
  options: string[];
  logic?: { option?: string; targetSectionId?: string };
  consent?: boolean;
};
type PublicSection = { id: string; title: string; questions: PublicQuestion[] };
type PublicDraft = { name: string; sections: PublicSection[] };

const DECLINE = /^(no|i do not consent|i don't consent|decline)$/i;

export default function PublishedResearchForm() {
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<PublicDraft | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [visitedSections, setVisitedSections] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const params = useParams<{ slug: string }>();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const publicToken = search.get("token") ?? "";
    const encoded = search.get("draft");
    setToken(publicToken);
    if (publicToken) {
      fetch(`/api/forms/public/${publicToken}`)
        .then(async response => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Could not load form");
          setDraft({ name: result.form.name, sections: result.form.sections });
        })
        .catch(err => setError(err instanceof Error ? err.message : "Could not load form"))
        .finally(() => setLoading(false));
      return;
    }
    setLoading(false);
    if (!encoded) return;
    try {
      const normalised = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalised.padEnd(normalised.length + (4 - normalised.length % 4) % 4, "=");
      const parsed = JSON.parse(decodeURIComponent(escape(atob(padded)))) as PublicDraft;
      if (parsed.sections?.length) setDraft(parsed);
    } catch { /* fall back to generic public form */ }
  }, []);

  const formTitle = draft?.name?.trim() || titleFromSlug(params.slug ?? "research-form");
  const sections = useMemo(() => draft?.sections ?? fallbackSections(), [draft]);
  const activeSection = sections[Math.min(activeSectionIndex, sections.length - 1)];
  const isLastSection = activeSectionIndex >= sections.length - 1;

  // A form opened without a token is a preview of an unpublished draft: there
  // is nowhere to send answers, so say so rather than accepting them.
  const isPreview = !token;

  const isSensitiveStudy = /wellness|health|medical|feminine|therapy|sexual|pregnan|fertility/i.test(formTitle);
  const totalQuestions = sections.reduce((total, section) => total + section.questions.length, 0);
  const minutes = Math.max(1, Math.round(
    sections.reduce((total, section) =>
      total + section.questions.reduce((sum, question) => sum + (question.type === "open" ? 40 : 12), 0), 0) / 60
  ));
  const intro = isSensitiveStudy
    ? `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}. Please avoid sharing medical details you are not comfortable including.`
    : `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}. Share what feels relevant; you do not need to include personally identifying details.`;

  const answeredCount = Object.values(answers).filter(value => value.trim()).length;
  const progress = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const consentQuestions = sections.flatMap(section => section.questions.filter(question => question.consent));
  const declinedConsent = consentQuestions.some(question => DECLINE.test(answers[question.id] ?? ""));
  const unansweredConsent = consentQuestions.filter(question => !(answers[question.id] ?? "").trim());

  const updateAnswer = (questionId: string, value: string) => {
    setNotice("");
    setAnswers(current => ({ ...current, [questionId]: value }));
  };

  const goNext = () => {
    const section = sections[activeSectionIndex];
    const blocking = section.questions.find(question => question.consent && !(answers[question.id] ?? "").trim());
    if (blocking) {
      setNotice("Please answer the consent question before continuing.");
      return;
    }
    setNotice("");
    setVisitedSections(current => current.includes(section.id) ? current : [...current, section.id]);
    const branch = section.questions.find(question => {
      if (!question.logic?.targetSectionId) return false;
      const answer = answers[question.id];
      return answer && (!question.logic.option || question.logic.option === answer);
    });
    if (branch?.logic?.targetSectionId) {
      const targetIndex = sections.findIndex(item => item.id === branch.logic?.targetSectionId);
      // Only ever branch forwards; a backwards target would loop the respondent.
      if (targetIndex > activeSectionIndex) {
        setActiveSectionIndex(targetIndex);
        return;
      }
    }
    setActiveSectionIndex(index => Math.min(index + 1, sections.length - 1));
  };

  const goBack = () => {
    setNotice("");
    setActiveSectionIndex(index => Math.max(index - 1, 0));
  };

  const submitAnswers = async () => {
    if (declinedConsent) {
      setNotice("You chose not to consent, so nothing has been recorded. You can close this page — thank you for your time.");
      return;
    }
    if (unansweredConsent.length) {
      setNotice("Please answer the consent question before submitting.");
      return;
    }
    if (!answeredCount) {
      setNotice("Please answer at least one question before submitting.");
      return;
    }
    if (isPreview) {
      setNotice("This is a preview of an unpublished form, so answers cannot be saved. Ask the researcher for the published link.");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const response = await fetch(`/api/forms/public/${token}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setNotice(result.error ?? "Your response could not be sent. Check your connection and try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setNotice("Your response could not be sent. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode, className = "") =>
    <main className="respondent-page"><section className={`respondent-card ${className}`}>
      <span className="respondent-brand"><Sprout size={26}/><b>Glean</b><small>Powered by Folde</small></span>
      {children}
    </section></main>;

  if (loading) {
    return shell(<div className="respondent-hero"><h1>Loading form…</h1><p>One moment while Glean opens the research form.</p></div>);
  }

  if (error) {
    return shell(<div className="respondent-hero"><h1>This form could not be opened.</h1><p>{error}</p><p>The link may have expired, or the researcher may have unpublished it.</p></div>);
  }

  if (submitted) {
    return shell(<>
      <div className="success-mark"><Check size={28}/></div>
      <h1>Thank you — your response was received.</h1>
      <p>Your answers will be reviewed by the researcher and used only as part of this research.</p>
    </>, "respondent-success");
  }

  return <main className="respondent-page">
    <section className="respondent-card">
      <header>
        <span className="respondent-brand"><Sprout size={26}/><b>Glean</b><small>Powered by Folde</small></span>
        <span className="respondent-badge">Anonymous research form</span>
      </header>
      <div className="respondent-hero">
        <h1>{formTitle}</h1>
        <p>{intro}</p>
      </div>
      {isPreview && <p className="respondent-preview-flag" role="status">Preview of an unpublished draft. Answers entered here are not saved.</p>}
      <div className="respondent-progress">
        <span>Section {activeSectionIndex + 1} of {sections.length}</span>
        <i aria-hidden="true"><b style={{ width: `${progress}%` }}/></i>
        <em
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={totalQuestions}
          aria-label="Questions answered"
        >{answeredCount} of {totalQuestions} answered</em>
      </div>
      <form className="respondent-form" onSubmit={event => { event.preventDefault(); submitAnswers(); }}>
        <section className="respondent-section active" key={activeSection.id}>
          <h2>{activeSection.title}</h2>
          <div className="respondent-question-list">
            {activeSection.questions.map(question =>
              <RespondentQuestion
                key={question.id}
                question={question}
                value={answers[question.id] ?? ""}
                onChange={value => updateAnswer(question.id, value)}
              />)}
          </div>
        </section>
        {notice && <p className="respondent-notice" role="alert">{notice}</p>}
        <div className="respondent-privacy"><LockKeyhole size={18}/><span>Your answers go to the research team for this study. Please only share what you are comfortable including.</span></div>
        <div className="respondent-nav">
          <button className="respondent-secondary" type="button" onClick={goBack} disabled={activeSectionIndex === 0}><ArrowLeft size={16}/>Back</button>
          {isLastSection
            ? <button className="primary-button" type="submit" disabled={submitting || declinedConsent}>{submitting ? "Sending…" : "Submit response"}<SendHorizontal size={16}/></button>
            : <button className="primary-button" type="button" onClick={goNext}>Continue<ChevronRight size={16}/></button>}
        </div>
      </form>
    </section>
  </main>;
}

function RespondentQuestion({ question, value, onChange }: { question: PublicQuestion; value: string; onChange: (value: string) => void }) {
  if (question.type === "open") {
    return <label className="respondent-question">
      <span>{question.text}</span>
      <textarea value={value} onChange={event => onChange(event.target.value)} rows={4} placeholder="Write your answer here."/>
    </label>;
  }
  // Radios, not toggle buttons: assistive tech announces "radio, 1 of 4",
  // arrow keys move within the group, and the choice is exclusive by default.
  return <fieldset className={`respondent-question ${question.type === "scale" ? "scale" : ""}`}>
    <legend>{question.text}{question.consent && <em className="respondent-required"> — required</em>}</legend>
    <div className={question.type === "scale" ? "respondent-scale" : "respondent-choice-list"}>
      {question.options.map(option =>
        <label key={option} className={value === option ? "selected" : ""}>
          <input
            type="radio"
            name={question.id}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>{option}</span>
        </label>)}
    </div>
  </fieldset>;
}

function fallbackSections(): PublicSection[] {
  return [
    { id: "fallback-screening", title: "Screening", questions: [{ id: "fallback-q1", text: "Which best describes your relationship to this topic or product area?", type: "single", options: ["Current user", "Past user", "Exploring options", "New to this area", "Prefer not to say"] }] },
    { id: "fallback-experience", title: "Experience", questions: [
      { id: "fallback-q2", text: "What problem, need, or pain point should the researcher understand?", type: "open", options: [] },
      { id: "fallback-q3", text: "What have you tried already, and what made those options work or fall short?", type: "open", options: [] },
      { id: "fallback-q4", text: "How important is solving this problem to you right now?", type: "scale", options: ["1 — Not important", "2", "3 — Somewhat important", "4", "5 — Very important"] }
    ] }
  ];
}

function titleFromSlug(slug: string) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase()) || "Research Form";
}
