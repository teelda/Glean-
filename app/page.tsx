"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, Bot, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardList, Download, Eye, FileText, FolderOpen, Home, Lightbulb,
  LockKeyhole, Menu, MessageSquareText, MoreHorizontal, Plus, Quote,
  Search, SendHorizontal, Settings, Share2, Sparkles, Sprout, Upload, X
} from "lucide-react";
import { sampleStudy } from "@/lib/sample-data";
import type { Evidence, Interview, Study, Theme, ThemeStatus } from "@/lib/types";

type Area = "home" | "studies" | "forms" | "study";
type Stage = "interviews" | "findings" | "report";

const initialStudy: Study = {
  ...sampleStudy,
  title: "Pricing onboarding research",
  updatedAt: "just now",
  themes: sampleStudy.themes.map((theme, index) => ({
    ...theme,
    status: index === 0 ? "approved" : "draft"
  }))
};

export default function GleanApp() {
  const [study, setStudy] = useState<Study>(initialStudy);
  const [area, setArea] = useState<Area>("home");
  const [stage, setStage] = useState<Stage>("findings");
  const [findingIndex, setFindingIndex] = useState(0);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("glean-study-v1");
    if (stored) {
      try { setStudy(JSON.parse(stored)); } catch { /* keep demo data */ }
    }
    setShowWelcome(!window.localStorage.getItem("glean-onboarded"));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("glean-study-v1", JSON.stringify(study));
  }, [study]);

  const approved = study.themes.filter(theme => theme.status === "approved").length;
  const reviewed = study.themes.filter(theme => theme.status !== "draft").length;
  const readiness = study.themes.length ? Math.round((reviewed / study.themes.length) * 100) : 0;
  const selectedTheme = study.themes[findingIndex] ?? null;

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const openStudy = (nextStage: Stage = "findings") => {
    setArea("study");
    setStage(nextStage);
    setMobileNav(false);
  };

  const changeStatus = (id: string, status: ThemeStatus) => {
    setStudy(current => ({
      ...current,
      themes: current.themes.map(theme => theme.id === id ? { ...theme, status } : theme)
    }));
    notify(status === "approved" ? "Finding approved" : status === "rejected" ? "Finding rejected" : "Finding moved to review");
  };

  const addInterview = (interview: Interview) => {
    setStudy(current => ({ ...current, interviews: [...current.interviews, interview], status: "stale", updatedAt: "just now" }));
    setShowAdd(false);
    setStage("interviews");
    notify(`${interview.participant.code} is ready`);
  };

  const analyse = () => {
    if (!study.interviews.length) return;
    setStudy(current => {
      if (current.themes.length) return { ...current, status: "analysed", updatedAt: "just now" };
      const interview = current.interviews[0];
      const lines = interview.transcript.split(/\n+/).map(line => line.trim()).filter(Boolean);
      const participantLine = lines.find(line => /^(participant|customer|user|interviewee|p\d+)\s*:/i.test(line));
      const quote = (participantLine ?? lines.find(line => line.length > 30) ?? interview.transcript).replace(/^[^:]{1,30}:\s*/, "").trim();
      const theme: Theme = {
        id: `theme-${Date.now()}`,
        title: "The first successful outcome needs a clearer path",
        summary: "The participant describes uncertainty before reaching value. This early pattern should be checked against more interviews before it becomes a strong finding.",
        strength: "emerging",
        participantCount: 1,
        status: "draft",
        tags: ["Need", "Opportunity"],
        x: 0,
        y: 0,
        evidence: [{
          id: `evidence-${Date.now()}`,
          interviewId: interview.id,
          participantCode: interview.participant.code,
          participantRole: interview.participant.role,
          quote,
          context: "Extracted from the first interview. Review the transcript context before approval.",
          segmentId: `${interview.id}-s1`
        }]
      };
      return { ...current, themes: [theme], status: "analysed", updatedAt: "just now" };
    });
    setFindingIndex(0);
    setStage("findings");
    notify("Findings are ready for review");
  };

  const exportEvidence = () => {
    const rows = [["Finding", "Strength", "Participant", "Role", "Exact quote", "Transcript segment"]];
    study.themes.filter(theme => theme.status === "approved").forEach(theme =>
      theme.evidence.forEach(item => rows.push([theme.title, theme.strength, item.participantCode, item.participantRole, item.quote, item.segmentId]))
    );
    const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadFile("glean-evidence.csv", csv, "text/csv");
    setShowExport(false);
    notify("Evidence CSV downloaded");
  };

  const exportWord = () => {
    const findings = study.themes.filter(theme => theme.status === "approved").map(theme => `
      <h2>${theme.title}</h2><p>${theme.summary}</p>
      <p><strong>Supported by ${theme.participantCount} participants</strong></p>
      ${theme.evidence.map(item => `<blockquote>“${item.quote}” — ${item.participantCode}, ${item.participantRole}</blockquote>`).join("")}
    `).join("");
    const report = `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;color:#12103b;line-height:1.55}h1{font-size:32px}h2{margin-top:34px;font-size:22px}blockquote{margin:18px 0;padding:16px 20px;background:#f7f6fb;border-left:4px solid #f5c842}</style></head><body><p>Glean · Powered by Folde</p><h1>${study.title}</h1><p>${study.goal}</p><h2>Executive summary</h2><p>${executiveSummary(study)}</p>${findings}<h2>Limitations</h2><p>This synthesis reflects ${study.interviews.length} interviews. Findings should be validated with additional participants and relevant product data.</p></body></html>`;
    downloadFile("glean-research-report.doc", report, "application/msword");
    setShowExport(false);
    notify("Word report downloaded");
  };

  return <div className="glean-app">
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>} 
    <Sidebar study={study} area={area} stage={stage} reviewed={reviewed} onArea={next => { setArea(next); setMobileNav(false); }} onStage={openStudy} onSettings={() => { setShowSettings(true); setMobileNav(false); }} mobileOpen={mobileNav}/>

    <main className="glean-main">
      <Topbar
        area={area}
        study={study}
        readiness={readiness}
        stage={stage}
        onMenu={() => setMobileNav(true)}
        onReport={() => openStudy("report")}
      />

      {area === "home" && <HomeView study={study} approved={approved} readiness={readiness} onContinue={() => openStudy(study.interviews.length ? "findings" : "interviews")} onNew={() => { setStudy(emptyStudy()); openStudy("interviews"); }} onChat={() => setShowChat(true)}/>} 
      {area === "studies" && <StudiesView study={study} onOpen={() => openStudy(study.interviews.length ? "findings" : "interviews")} onNew={() => { setStudy(emptyStudy()); openStudy("interviews"); }} onForms={() => setArea("forms")}/>} 
      {area === "forms" && <FormsView study={study} onOpenStudy={() => openStudy("interviews")} onCopied={() => notify("Form link copied")}/>} 
      {area === "study" && stage === "interviews" && <InterviewsStage study={study} onAdd={() => setShowAdd(true)} onAnalyse={analyse}/>} 
      {area === "study" && stage === "findings" && <FindingsStage
        study={study}
        theme={selectedTheme}
        index={findingIndex}
        onPrevious={() => setFindingIndex(index => Math.max(0, index - 1))}
        onNext={() => setFindingIndex(index => Math.min(study.themes.length - 1, index + 1))}
        onEvidence={setEvidence}
        onStatus={changeStatus}
        onAdd={() => setStage("interviews")}
        onAnalyse={analyse}
        onReport={() => setStage("report")}
      />} 
      {area === "study" && stage === "report" && <ReportStage study={study} onReview={() => setStage("findings")} onExport={() => setShowExport(value => !value)} onShare={() => setShowShare(true)} exportOpen={showExport} onPdf={() => { window.print(); setShowExport(false); }} onWord={exportWord} onCsv={exportEvidence}/>} 
    </main>

    {evidence && <EvidenceDrawer evidence={evidence} study={study} onClose={() => setEvidence(null)}/>} 
    {showAdd && <AddInterviewModal study={study} onClose={() => setShowAdd(false)} onAdd={addInterview}/>} 
    {showChat && <ChatModal study={study} onClose={() => setShowChat(false)} onReview={() => { setShowChat(false); openStudy("findings"); }}/>} 
    {showShare && <ShareModal study={study} approved={approved} onClose={() => setShowShare(false)} onDone={() => { setShowShare(false); notify("Private report link created"); }}/>} 
    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSave={() => { setShowSettings(false); notify("Settings saved"); }}/>} 
    {showWelcome && <Welcome onExplore={() => { window.localStorage.setItem("glean-onboarded", "true"); setShowWelcome(false); }} onCreate={() => { window.localStorage.setItem("glean-onboarded", "true"); setStudy(emptyStudy()); setShowWelcome(false); openStudy("interviews"); }}/>} 
    {toast && <div className="glean-toast" role="status"><Check size={16}/>{toast}</div>}
  </div>;
}

function Sidebar({ study, area, stage, reviewed, onArea, onStage, onSettings, mobileOpen }: { study: Study; area: Area; stage: Stage; reviewed: number; onArea: (area: Area) => void; onStage: (stage: Stage) => void; onSettings: () => void; mobileOpen: boolean }) {
  const steps: { id: Stage; label: string; meta: string }[] = [
    { id: "interviews", label: "Add interviews", meta: `${study.interviews.length} interviews` },
    { id: "findings", label: "Review findings", meta: `${study.themes.length} findings` },
    { id: "report", label: "Present report", meta: study.themes.some(theme => theme.status === "approved") ? "Ready to draft" : "Not started" }
  ];
  return <aside className={`glean-sidebar ${mobileOpen ? "open" : ""}`}>
    <button className="glean-brand" onClick={() => onArea("home")} aria-label="Glean home"><span><Sprout size={26}/></span><span><b>Glean</b><small>Powered by Folde</small></span></button>
    <nav className="global-nav" aria-label="Primary navigation">
      <button className={area === "home" ? "active" : ""} onClick={() => onArea("home")}><Home size={20}/>Home</button>
      <button className={area === "studies" || area === "study" ? "active" : ""} onClick={() => onArea("studies")}><FolderOpen size={20}/>Studies</button>
      <button className={area === "forms" ? "active" : ""} onClick={() => onArea("forms")}><ClipboardList size={20}/>Forms</button>
      <button className={area === "study" && stage === "report" ? "active" : ""} onClick={() => onStage("report")}><FileText size={20}/>Reports</button>
    </nav>
    <section className="current-study-nav">
      <span className="nav-label">CURRENT STUDY</span>
      <button className="study-name" onClick={() => onStage(stage)}><span>{study.title}</span><ChevronRight size={16}/></button>
      <div className="journey-nav">
        {steps.map((step, index) => {
          const complete = step.id === "interviews" ? study.interviews.length > 0 : step.id === "findings" ? study.themes.length > 0 && reviewed === study.themes.length : false;
          return <button key={step.id} className={area === "study" && stage === step.id ? "active" : ""} onClick={() => onStage(step.id)}>
            <span className={`step-marker ${complete ? "complete" : ""}`}>{complete ? <Check size={15}/> : index + 1}</span>
            <span><b>{step.label}</b><small>{step.meta}</small></span>
          </button>;
        })}
      </div>
      <div className="study-progress"><span><b>Study progress</b><small>{reviewed} of {study.themes.length} findings reviewed</small></span><i><b style={{ width: `${study.themes.length ? (reviewed / study.themes.length) * 100 : 0}%` }}/></i></div>
    </section>
    <div className="sidebar-footer">
      <button onClick={() => alert("Glean guides are coming soon.")}><CircleHelp size={20}/>Help</button>
      <button onClick={onSettings}><Settings size={20}/>Settings</button>
      <button className="profile"><span>MA</span><span><b>Matilda Anashie</b><small>Researcher</small></span><ChevronDown size={15}/></button>
    </div>
  </aside>;
}

function Topbar({ area, study, readiness, stage, onMenu, onReport }: { area: Area; study: Study; readiness: number; stage: Stage; onMenu: () => void; onReport: () => void }) {
  return <header className="glean-topbar">
    <div className="topbar-title"><button className="mobile-menu" aria-label="Open navigation" onClick={onMenu}><Menu size={20}/></button><b>{area === "home" ? "Home" : area === "studies" ? "Studies" : area === "forms" ? "Forms" : study.title}</b>{area === "study" && <ChevronDown size={15}/>}</div>
    {area === "study" && <div className="topbar-actions"><div className="report-readiness"><span>Report readiness</span><i/><b>{readiness >= 75 ? "Good" : readiness ? "In progress" : "Not started"}</b><div><span style={{ width: `${readiness}%` }}/></div><em>{readiness}%</em></div>{stage !== "report" && <button className="outline-button" onClick={onReport}><FileText size={17}/>Open report</button>}</div>}
  </header>;
}

function HomeView({ study, approved, readiness, onContinue, onNew, onChat }: { study: Study; approved: number; readiness: number; onContinue: () => void; onNew: () => void; onChat: () => void }) {
  const reviewed = study.themes.filter(theme => theme.status !== "draft").length;
  const draftFindings = study.themes.length - approved;
  const topFinding = study.themes[0];
  return <section className="home-view page-pad">
    <div className="home-shell">
      <section className="home-copy">
        <span className="eyebrow">RESEARCH WORKSPACE</span>
        <h1>Turn interviews into decisions.</h1>
        <p>Glean helps you move from messy transcripts to reviewed findings, exact quotes, and a report people can trust.</p>
        <div className="hero-actions">
          <button className="primary-button" onClick={onContinue}>Continue<ArrowRight size={17}/></button>
          <button className="outline-button" onClick={onNew}><Plus size={17}/>New study</button>
          <button className="text-button" onClick={onChat}><Bot size={17}/>Ask Glean</button>
        </div>
        <div className="home-detail-grid">
          <HomeDetail title="Current phase" value="Phase 1 + forms prototype" text="Transcripts, reviewed findings, report export, share links, and research form publishing are represented in the app."/>
          <HomeDetail title="Meeting notes" value="Planned, not live" text="Joining Zoom, Meet, or Teams to record and take notes belongs to the meeting-bot phase, after consent and integrations are built."/>
          <HomeDetail title="Evidence rule" value="Quote first" text="Findings are shown with exact participant quotes so a researcher can verify the claim before approving it."/>
        </div>
      </section>
      <section className="home-study-panel" aria-label="Active study">
        <span className="eyebrow">ACTIVE STUDY</span>
        <h2>{study.title}</h2>
        <p>{study.goal}</p>
        <div className="home-metrics">
          <Metric value={study.interviews.length} label="Interviews"/>
          <Metric value={approved} label="Approved"/>
          <Metric value={draftFindings} label="To review"/>
        </div>
        <button className="text-button study-link" onClick={onContinue}>Open study<ChevronRight size={16}/></button>
      </section>
    </div>
    <div className="home-workbench">
      <section className="home-summary">
        <div><span className="eyebrow">LATEST SYNTHESIS</span><h2>{topFinding?.title ?? "No findings yet"}</h2></div>
        <p>{topFinding?.summary ?? "Add interviews and run analysis to create the first draft synthesis."}</p>
        <div className="summary-strip"><span><b>{readiness}%</b><small>Review readiness</small></span><span><b>{study.status}</b><small>Study status</small></span><span><b>{study.updatedAt}</b><small>Last updated</small></span></div>
      </section>
      <section className="home-chat-card">
        <div><span><Bot size={18}/></span><span><b>Study chat</b><small>Answers must come from interviews and approved findings.</small></span></div>
        <button className="chat-question" onClick={onChat}>What should we change in onboarding?</button>
        <button className="chat-question" onClick={onChat}>Which problems have the strongest support?</button>
        <button className="primary-button" onClick={onChat}>Open chat<SendHorizontal size={16}/></button>
      </section>
    </div>
    <div className="home-journey">
      <JourneyLine number="1" title="Add interviews" text={`${study.interviews.length} conversations in your active study`} complete={study.interviews.length > 0}/>
      <JourneyLine number="2" title="Review findings" text={`${reviewed} of ${study.themes.length} findings reviewed`} complete={approved > 0}/>
      <JourneyLine number="3" title="Present report" text="Export the approved synthesis" complete={approved > 0}/>
    </div>
  </section>;
}

function HomeDetail({ title, value, text }: { title: string; value: string; text: string }) {
  return <article><span>{title}</span><b>{value}</b><p>{text}</p></article>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <span><b>{value}</b><small>{label}</small></span>;
}

function JourneyLine({ number, title, text, complete }: { number: string; title: string; text: string; complete: boolean }) {
  return <div className="journey-line"><span>{complete ? <Check size={17}/> : number}</span><div><b>{title}</b><small>{text}</small></div></div>;
}

function StudiesView({ study, onOpen, onNew, onForms }: { study: Study; onOpen: () => void; onNew: () => void; onForms: () => void }) {
  const [query, setQuery] = useState("");
  const matches = study.title.toLowerCase().includes(query.toLowerCase()) || study.goal.toLowerCase().includes(query.toLowerCase());
  return <section className="studies-view page-pad">
    <div className="research-header">
      <div><span className="eyebrow">RESEARCH</span><h1>Your research workspace.</h1><p>Plan studies, collect interviews, create forms, and move reviewed findings into reports from one place.</p></div>
      <div className="research-actions"><button className="outline-button" onClick={onForms}><ClipboardList size={17}/>Create form</button><button className="primary-button" onClick={onNew}><Plus size={17}/>New study</button></div>
    </div>
    <div className="research-grid">
      <section className="research-main">
        <div className="section-bar"><div><span className="eyebrow">ACTIVE STUDIES</span><h2>Studies</h2></div><label className="search-field compact"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search"/></label></div>
        {matches ? <button className="research-study-card" onClick={onOpen}>
          <span className="study-monogram">P</span>
          <span><b>{study.title}</b><small>{study.goal}</small><em>{study.interviews.length} interviews · {study.themes.length} findings · Updated {study.updatedAt}</em></span>
          <span className="status-chip">In review</span>
          <ChevronRight size={18}/>
        </button> : <div className="empty-search"><Search size={26}/><h3>No studies found</h3><p>Try a different title or research goal.</p></div>}
      </section>
      <aside className="research-side">
        <section><span className="eyebrow">NEXT BEST ACTION</span><h2>Generate a research form</h2><p>Give Glean the goal, audience, and decision. It drafts the screener, consent, and questions so you are editing structure instead of building from zero.</p><button className="primary-button" onClick={onForms}><Sparkles size={17}/>Start with context</button></section>
        <section><span className="eyebrow">WORKFLOW</span><div className="research-flow"><span>Brief</span><ChevronRight size={14}/><span>Form</span><ChevronRight size={14}/><span>Responses</span><ChevronRight size={14}/><span>Findings</span></div></section>
      </aside>
    </div>
  </section>;
}

type FormQuestion = { id: string; text: string; type: "open" | "single" | "scale"; options: string[] };
type FormSection = { id: string; title: string; questions: FormQuestion[] };

function FormsView({ study, onOpenStudy, onCopied }: { study: Study; onOpenStudy: () => void; onCopied: () => void }) {
  const [generated, setGenerated] = useState(false);
  const [published, setPublished] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [responses, setResponses] = useState(0);
  const [moved, setMoved] = useState(false);
  const [expiry, setExpiry] = useState("7 days");
  const [anonymous, setAnonymous] = useState(true);
  const [origin, setOrigin] = useState("");
  const [formName, setFormName] = useState("Feminine wellness research form");
  const [sections, setSections] = useState<FormSection[]>([
    { id: "section-1", title: "Screening", questions: [
      { id: "q1", text: "Which best describes your current relationship with feminine wellness products or services?", type: "single", options: ["Actively use them", "Exploring options", "Curious but unsure", "Prefer not to say"] }
    ] },
    { id: "section-2", title: "Experience", questions: [
      { id: "q2", text: "What usually makes a feminine wellness product feel trustworthy or safe to you?", type: "open", options: [] },
      { id: "q3", text: "What feels confusing, uncomfortable, or missing when researching feminine wellness options?", type: "open", options: [] },
      { id: "q4", text: "How comfortable would you feel sharing sensitive wellness context in a digital product?", type: "scale", options: ["1", "2", "3", "4", "5"] }
    ] }
  ]);
  useEffect(() => setOrigin(window.location.origin), []);
  const questionCount = sections.reduce((total, section) => total + section.questions.length, 0);
  const formPath = "/forms/feminine-wellness-study";
  const shareUrl = `${origin || "http://localhost:3210"}${formPath}`;
  const copyShareLink = async () => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        onCopied();
        return;
      } catch { /* use textarea fallback */ }
    }
    const helper = document.createElement("textarea");
    helper.value = shareUrl;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    document.body.removeChild(helper);
    onCopied();
  };
  const updateSection = (sectionId: string, title: string) => setSections(current => current.map(section => section.id === sectionId ? { ...section, title } : section));
  const updateQuestion = (sectionId: string, questionId: string, patch: Partial<FormQuestion>) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: section.questions.map(question => question.id === questionId ? { ...question, ...patch } : question) } : section));
  const addSection = () => setSections(current => [...current, { id: `section-${Date.now()}`, title: "New section", questions: [{ id: `q-${Date.now()}`, text: "What do we need to learn here?", type: "open", options: [] }] }]);
  const addQuestion = (sectionId: string) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: [...section.questions, { id: `q-${Date.now()}`, text: "New question", type: "open", options: [] }] } : section));
  const moveQuestion = (sectionId: string, questionId: string, direction: -1 | 1) => setSections(current => current.map(section => {
    if (section.id !== sectionId) return section;
    const from = section.questions.findIndex(question => question.id === questionId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= section.questions.length) return section;
    const questions = [...section.questions];
    const [item] = questions.splice(from, 1);
    questions.splice(to, 0, item);
    return { ...section, questions };
  }));
  const addOption = (sectionId: string, questionId: string) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: section.questions.map(question => question.id === questionId ? { ...question, options: [...question.options, "New option"] } : question) } : section));
  const updateOption = (sectionId: string, questionId: string, optionIndex: number, value: string) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: section.questions.map(question => question.id === questionId ? { ...question, options: question.options.map((option, index) => index === optionIndex ? value : option) } : question) } : section));
  return <section className="forms-view page-pad">
    <div className="research-header">
      <div><span className="eyebrow">FORMS</span><h1>Create research forms from context.</h1><p>Not a blank canvas. Start with what you need to learn, and Glean drafts a focused form you can edit before sharing.</p></div>
      <button className="outline-button" onClick={onOpenStudy}><Upload size={17}/>Use transcripts instead</button>
    </div>
    <div className="form-builder-grid">
      <section className="form-context-panel">
        <span className="eyebrow">CONTEXT</span>
        <label>Form name<input value={formName} onChange={event => setFormName(event.target.value)}/></label>
        <label>Research goal<textarea rows={4} defaultValue={study.goal}/></label>
        <label>Audience<input defaultValue="People exploring feminine wellness products, care routines, or support services"/></label>
        <label>Decision this should inform<input defaultValue="What language, trust signals, and product support would make the experience feel safe"/></label>
        <div className="form-chips"><span>Screener</span><span>Consent</span><span>Open questions</span><span>Follow-up prompts</span></div>
        <button className="primary-button" onClick={() => { setGenerated(true); setPublished(false); setShowEditor(true); }}><Sparkles size={17}/>Generate form</button>
      </section>
      <section className="form-preview-panel">
        <div className="section-bar"><div><span className="eyebrow">{published ? "PUBLIC FORM" : "BUILDER"}</span><h2>{generated ? formName : "Draft before publishing"}</h2></div><span className="status-chip">{published ? "Published" : `${questionCount} questions`}</span></div>
        <div className="builder-toolbar"><button className="outline-button" onClick={() => setShowEditor(value => !value)} disabled={!generated}><Plus size={16}/>{showEditor ? "Hide editor" : "Edit form"}</button><button className="outline-button" onClick={() => { setPublished(true); setShowEditor(false); }} disabled={!generated}><Share2 size={16}/>Publish form</button></div>
        {published && <div className="form-share-card">
          <header>
            <span className="published-icon"><Share2 size={18}/></span>
            <div>
              <span className="eyebrow">LIVE RESPONDENT LINK</span>
              <h3>{formName} is published</h3>
              <p>Share this link the same way you would share a Google Form. Respondents see a clean public form, while responses stay ready for review before they move into the analyser.</p>
            </div>
            <span className="published-pill">Collecting</span>
          </header>
          <div className="share-link-row"><code>{shareUrl}</code><button onClick={copyShareLink}>Copy public link</button><a href={formPath} target="_blank">Open public form</a></div>
          <div className="share-settings">
            <label>Link expiry<select value={expiry} onChange={event => setExpiry(event.target.value)}><option>7 days</option><option>14 days</option><option>30 days</option><option>No expiry for this test</option></select></label>
            <label className="checkbox-row"><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)}/><span>Collect anonymous responses</span></label>
          </div>
          <small>{anonymous ? "Names and emails are not requested on the respondent form." : "Respondent identity collection is off in this prototype until consent fields are configured."} Link expires in {expiry.toLowerCase()}.</small>
        </div>}
        {published && <div className="public-form-preview">
          <div className="preview-paper">
            <span className="respondent-badge">What respondents see</span>
            <h3>{formName}</h3>
            <p>Help us understand what makes feminine wellness support feel safe, useful, and trustworthy.</p>
            {sections.flatMap(section => section.questions).slice(0, 3).map((question, index) => <div className="preview-question" key={question.id}><span>{index + 1}</span><b>{question.text}</b><em>{question.type === "open" ? "Long answer" : question.type === "single" ? "Multiple choice" : "Rating scale"}</em></div>)}
            <button className="primary-button">Submit response<SendHorizontal size={16}/></button>
          </div>
        </div>}
        {showEditor && <div className="editor-disclosure"><div><span className="eyebrow">{published ? "OWNER ONLY" : "EDIT FORM"}</span><h3>{published ? "Edit form sections" : "Form sections"}</h3><p>{published ? "These sections are only visible to you as the researcher. People who open the public link see the clean respondent form above." : "Add, rename, reorder, and tune the questions before publishing."}</p></div></div>}
        {showEditor && <div className="editable-form">{sections.map((section, sectionIndex) => <section key={section.id} className="editable-section">
          <label>Section {sectionIndex + 1}<input value={section.title} onChange={event => updateSection(section.id, event.target.value)}/></label>
          {section.questions.map((question, questionIndex) => <article key={question.id} className="editable-question">
            <div className="question-topline"><span>{questionIndex + 1}</span><select value={question.type} onChange={event => updateQuestion(section.id, question.id, { type: event.target.value as FormQuestion["type"], options: event.target.value === "single" ? question.options.length ? question.options : ["Option 1", "Option 2"] : event.target.value === "scale" ? ["1", "2", "3", "4", "5"] : [] })}><option value="open">Open text</option><option value="single">Single choice</option><option value="scale">Rating scale</option></select><button onClick={() => moveQuestion(section.id, question.id, -1)} aria-label="Move question up"><ArrowLeft size={15}/></button><button onClick={() => moveQuestion(section.id, question.id, 1)} aria-label="Move question down"><ArrowRight size={15}/></button></div>
            <textarea rows={2} value={question.text} onChange={event => updateQuestion(section.id, question.id, { text: event.target.value })}/>
            {question.options.length > 0 && <div className="option-list">{question.options.map((option, optionIndex) => <input key={`${question.id}-${optionIndex}`} value={option} onChange={event => updateOption(section.id, question.id, optionIndex, event.target.value)}/>) }{question.type === "single" && <button className="text-button" onClick={() => addOption(section.id, question.id)}><Plus size={14}/>Add option</button>}</div>}
          </article>)}
          <button className="text-button add-question" onClick={() => addQuestion(section.id)}><Plus size={15}/>Add question</button>
        </section>)}</div>}
        <div className="responses-panel">
          <div><span className="eyebrow">RESPONSES</span><h3>{responses} collected</h3><p>{responses ? "4 people mention trust and privacy language. 3 ask for clearer evidence before trying a sensitive wellness product." : published ? "Your published link is ready. Use sample responses here to preview how answers become research evidence." : "Publish the form before collecting responses."}</p></div>
          <div className="response-actions"><button className="outline-button" onClick={() => setResponses(8)} disabled={!published}><MessageSquareText size={16}/>Collect sample</button><button className="primary-button" disabled={!responses} onClick={() => setMoved(true)}><BarChart3 size={16}/>Move to analyser</button></div>
          {moved && <div className="analysis-ready"><Check size={16}/><span>Response summary is ready inside the UX analyser as a new evidence source.</span></div>}
        </div>
      </section>
    </div>
  </section>;
}

function InterviewsStage({ study, onAdd, onAnalyse }: { study: Study; onAdd: () => void; onAnalyse: () => void }) {
  return <section className="interviews-stage page-pad"><div className="intake-layout"><div><span className="eyebrow">STEP 1 · ADD INTERVIEWS</span><h1>Add the conversations you want to learn from.</h1><p className="lead">Upload or paste interviews. Glean will look for repeated problems and preserve the exact words behind every finding.</p><button className="drop-zone" onClick={onAdd}><Upload size={24}/><b>Drop files here or click to upload</b><small>PDF, DOCX, TXT, or paste transcript text</small></button><div className="interview-heading"><h2>{study.interviews.length} interviews added</h2><button className="text-button" onClick={onAdd}><Plus size={16}/>Add another</button></div>{study.interviews.length ? <div className="interview-list">{study.interviews.map(interview => <div className="interview-row" key={interview.id}><span className="participant-code">{interview.participant.code}</span><span><b>{interview.participant.role}</b><small>{interview.participant.segment}</small></span><span className="quality"><Check size={15}/>Transcript ready</span><span>{interview.wordCount.toLocaleString()} words</span><button aria-label={`More options for ${interview.participant.code}`}><MoreHorizontal size={17}/></button></div>)}</div> : <div className="empty-interviews"><MessageSquareText size={28}/><h3>No interviews yet</h3><p>Add the first transcript to begin your study.</p></div>}<div className="intake-actions"><span>5–20 interviews works best for reliable findings.</span><button className="primary-button" disabled={!study.interviews.length} onClick={onAnalyse}><Sparkles size={17}/>Analyse {study.interviews.length} interviews</button></div></div><aside className="what-next"><h2>What happens next</h2><NextItem icon={<Search size={19}/>} title="Find repeated problems" text="Glean scans across interviews to surface what comes up most often."/><NextItem icon={<Quote size={19}/>} title="Link to exact quotes" text="Every finding stays connected to what participants actually said."/><NextItem icon={<FileText size={19}/>} title="Draft your report" text="Approved findings become a clear report you can edit and export."/><div className="privacy"><LockKeyhole size={18}/><span><b>Your data stays private</b><small>Only you can access raw interviews in this prototype.</small></span></div></aside></div></section>;
}

function NextItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="next-item"><span>{icon}</span><div><b>{title}</b><p>{text}</p></div></div>; }

function FindingsStage({ study, theme, index, onPrevious, onNext, onEvidence, onStatus, onAdd, onAnalyse, onReport }: { study: Study; theme: Theme | null; index: number; onPrevious: () => void; onNext: () => void; onEvidence: (evidence: Evidence) => void; onStatus: (id: string, status: ThemeStatus) => void; onAdd: () => void; onAnalyse: () => void; onReport: () => void }) {
  if (!study.interviews.length) return <EmptyStage eyebrow="STEP 1 · ADD INTERVIEWS" title="Add interviews before looking for patterns." text="Glean needs participant conversations before it can draft findings." action="Add first interview" onAction={onAdd}/>;
  if (!theme) return <EmptyStage eyebrow="STEP 2 · REVIEW FINDINGS" title="Your interviews are ready to analyse." text="Run analysis to surface early patterns linked to exact transcript quotes." action={`Analyse ${study.interviews.length} interviews`} onAction={onAnalyse}/>;
  const quote = theme.evidence[0];
  return <section className="finding-stage page-pad"><div className="finding-nav"><button disabled={index === 0} onClick={onPrevious}><ArrowLeft size={16}/>Previous finding</button><span>Finding {index + 1} of {study.themes.length}</span><button disabled={index === study.themes.length - 1} onClick={onNext}>Next finding<ArrowRight size={16}/></button></div><div className="finding-heading"><div><span className="eyebrow">FINDING</span><h1>{theme.title}</h1><p>{theme.summary}</p></div><div className="coverage-block"><span className="eyebrow">PARTICIPANT COVERAGE</span><div><b>{theme.participantCount}</b><span>of {study.interviews.length} participants<small>{Math.round((theme.participantCount / study.interviews.length) * 100)}%</small></span></div><div className="avatar-row">{study.interviews.slice(0, 6).map((interview, avatarIndex) => <span key={interview.id} className={avatarIndex < theme.participantCount ? "included" : ""}>{interview.participant.code.replace("P", "")}</span>)}</div></div></div><section className="exact-quote"><span className="eyebrow">EXACT QUOTE</span><div><Quote size={25}/><blockquote>{quote.quote}</blockquote></div><footer><span><b>{quote.participantCode}</b> · {quote.participantRole} · {quote.segmentId}</span><button className="outline-button" onClick={() => onEvidence(quote)}><Eye size={17}/>View transcript context</button></footer></section><div className="meaning-labels"><span>WHAT PARTICIPANTS SAID</span><ArrowRight size={15}/><span>THE PATTERN</span><ArrowRight size={15}/><span>WHAT WE COULD DO</span></div><div className="meaning-flow"><Meaning icon={<MessageSquareText size={21}/>} title="What participants said" text="People want to understand the outcome before they commit to setup decisions." tone="lavender"/><ArrowRight className="flow-arrow" size={20}/><Meaning icon={<BarChart3 size={21}/>} title="The pattern" text={theme.summary} tone="yellow"/><ArrowRight className="flow-arrow" size={20}/><Meaning icon={<Lightbulb size={21}/>} title="What we could do" text="Show a clear successful outcome earlier, then guide people toward it." tone="mint"/></div><div className="opportunity"><span className="eyebrow">OPPORTUNITY</span><p>Introduce an outcome-first message that defines success, shows a finished example, and gives users one recommended next step.</p></div><div className="finding-actions"><button className="outline-button" onClick={() => onEvidence(quote)}><Eye size={17}/>View transcript context</button>{theme.status === "approved" ? <button className="approved-button" onClick={() => onStatus(theme.id, "draft")}><Check size={17}/>Approved · Move to review</button> : <><button className="text-button reject" onClick={() => onStatus(theme.id, "rejected")}><X size={17}/>Reject</button><button className="primary-button" onClick={() => { onStatus(theme.id, "approved"); if (index === study.themes.length - 1) window.setTimeout(onReport, 400); }}><Check size={17}/>Approve finding</button></>}</div></section>;
}

function Meaning({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone: string }) { return <div className={`meaning ${tone}`}><span>{icon}</span><div><b>{title}</b><p>{text}</p></div></div>; }

function EmptyStage({ eyebrow, title, text, action, onAction }: { eyebrow: string; title: string; text: string; action: string; onAction: () => void }) { return <section className="empty-stage"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p><button className="primary-button" onClick={onAction}>{action}<ArrowRight size={17}/></button></section>; }

function ReportStage({ study, onReview, onExport, onShare, exportOpen, onPdf, onWord, onCsv }: { study: Study; onReview: () => void; onExport: () => void; onShare: () => void; exportOpen: boolean; onPdf: () => void; onWord: () => void; onCsv: () => void }) {
  const approved = study.themes.filter(theme => theme.status === "approved");
  return <section className="report-stage"><aside className="report-outline"><span className="eyebrow">REPORT OUTLINE</span><button className="active">Executive summary</button><span>Findings</span>{approved.map((theme, index) => <button key={theme.id}>{index + 1}. {theme.title}</button>)}<span>Design opportunities</span><button>Recommendations</button><span>Limitations</span><span>Evidence appendix</span></aside><article className="report-document"><div className="report-document-head"><div><span className="eyebrow">RESEARCH REPORT · JULY 17, 2026</span><h1>{study.title}</h1><p>{study.goal}</p></div><div className="report-actions"><div className="export-wrap"><button className="outline-button" onClick={onExport}><Download size={17}/>Export report<ChevronDown size={15}/></button>{exportOpen && <div className="export-menu"><button onClick={onPdf}><FileText size={16}/>Print / Save PDF</button><button onClick={onWord}><FileText size={16}/>Download Word report</button><button onClick={onCsv}><BarChart3 size={16}/>Download evidence CSV</button></div>}</div><button className="outline-button" onClick={onShare}><Share2 size={17}/>Share private link</button></div></div><section><h2>Executive summary</h2><p>{executiveSummary(study)}</p></section>{approved.length ? approved.map((theme, index) => <section className="report-finding" key={theme.id}><span className="finding-number">Finding {index + 1}</span><h2>{theme.title}</h2><p>{theme.summary}</p><div className="report-coverage">Supported by {theme.participantCount} of {study.interviews.length} participants</div><blockquote>“{theme.evidence[0].quote}”<small>{theme.evidence[0].participantCode} · {theme.evidence[0].participantRole}</small></blockquote><h3>Design opportunity</h3><p>Make the successful outcome visible earlier and give users one recommended next step they can complete safely.</p></section>) : <div className="report-empty"><FileText size={28}/><h2>No approved findings yet</h2><p>Review and approve at least one finding before presenting the report.</p><button className="primary-button" onClick={onReview}>Review findings</button></div>}<section><h2>Limitations</h2><p>This study includes {study.interviews.length} interviews. Findings should be validated against additional user segments and relevant product behaviour data.</p></section></article></section>;
}

function EvidenceDrawer({ evidence, study, onClose }: { evidence: Evidence; study: Study; onClose: () => void }) {
  const interview = study.interviews.find(item => item.id === evidence.interviewId);
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><aside className="evidence-drawer"><header><div><span className="eyebrow">SOURCE QUOTE</span><h2>{evidence.participantCode} · {evidence.participantRole}</h2></div><button aria-label="Close transcript context" onClick={onClose}><X size={20}/></button></header><blockquote>“{evidence.quote}”</blockquote><div className="source-meta"><span>{interview?.title}</span><span>{interview?.date}</span><span>{evidence.segmentId}</span></div><section><h3>Transcript context</h3><div className="transcript">{interview?.transcript.split("\n\n").map((paragraph, index) => <p key={index} className={paragraph.includes(evidence.quote.slice(0, 22)) ? "highlight" : ""}>{paragraph}</p>)}</div></section><section><h3>Why this supports the finding</h3><p>{evidence.context}</p></section></aside></div>;
}

function AddInterviewModal({ study, onClose, onAdd }: { study: Study; onClose: () => void; onAdd: (interview: Interview) => void }) {
  const [role, setRole] = useState("");
  const [transcript, setTranscript] = useState("");
  const code = `P${String(study.interviews.length + 1).padStart(2, "0")}`;
  const submit = () => onAdd({ id: `interview-${Date.now()}`, participant: { id: `participant-${Date.now()}`, code, role: role.trim(), segment: "New participant", accent: "mint" }, title: `Interview · ${code}`, date: "Jul 17", source: "paste", wordCount: transcript.trim().split(/\s+/).length, status: "ready", transcript: transcript.trim(), summary: "Ready for analysis." });
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal"><header><div><span className="eyebrow">ADD INTERVIEW</span><h2>Bring in a conversation.</h2></div><button aria-label="Close add interview" onClick={onClose}><X size={20}/></button></header><div className="modal-body"><label>Participant code<input value={code} disabled/></label><label>Participant role<input autoFocus value={role} onChange={event => setRole(event.target.value)} placeholder="e.g. Product designer"/></label><label>Transcript<textarea rows={10} value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Interviewer: Tell me what you expected…\n\nParticipant: I wanted to…"/></label><div className="privacy-note"><LockKeyhole size={17}/><span><b>Private by default</b><small>Raw transcripts stay visible only to you.</small></span></div></div><footer><button className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!role.trim() || transcript.trim().length < 40} onClick={submit}>Add interview</button></footer></div></div>;
}

function ShareModal({ study, approved, onClose, onDone }: { study: Study; approved: number; onClose: () => void; onDone: () => void }) {
  const [published, setPublished] = useState(false);
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="modal share-modal"><header><div><span className="eyebrow">SHARE REPORT</span><h2>{published ? "Your private link is ready" : "Share a read-only report"}</h2></div><button aria-label="Close share report" onClick={onClose}><X size={20}/></button></header>{published ? <div className="share-ready"><span><Check size={22}/></span><p>The link expires in 7 days and includes only approved findings.</p><div><code>glean.folde.com/share/pricing••••</code><button onClick={() => navigator.clipboard?.writeText("https://glean.folde.com/share/pricing-demo")}>Copy</button></div></div> : <div className="modal-body"><p className="modal-copy">Share {approved} approved {approved === 1 ? "finding" : "findings"}, the executive summary, opportunities, and limitations. Raw transcripts are never included.</p><label>Link expiry<select defaultValue="7"><option value="1">After 24 hours</option><option value="7">After 7 days</option><option value="30">After 30 days</option></select></label></div>}<footer>{published ? <button className="primary-button" onClick={onDone}>Done</button> : <><button className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!approved} onClick={() => setPublished(true)}>Create private link</button></>}</footer></div></div>;
}

function ChatModal({ study, onClose, onReview }: { study: Study; onClose: () => void; onReview: () => void }) {
  const approved = study.themes.filter(theme => theme.status === "approved");
  const finding = approved[0] ?? study.themes[0];
  const quote = finding?.evidence[0];
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal chat-modal">
      <header><div><span className="eyebrow">STUDY CHAT</span><h2>Ask Glean</h2></div><button aria-label="Close chat" onClick={onClose}><X size={20}/></button></header>
      <div className="chat-body">
        <div className="chat-message user">What should we change in onboarding?</div>
        <div className="chat-message assistant">
          <b>Draft answer</b>
          <p>{finding ? "Make the successful outcome visible earlier, then guide people toward one clear next step. This answer is based on the current reviewed synthesis and should be checked against the source quote before sharing." : "There is not enough interview evidence yet. Add interviews and review findings before Glean can answer from the study."}</p>
          {quote && <button className="citation-chip" onClick={onReview}><Quote size={14}/>{quote.participantCode} - {quote.segmentId}</button>}
        </div>
        <div className="chat-limits"><LockKeyhole size={16}/><span><b>Evidence-bound mode is planned for Phase 3.</b><small>This prototype shows the intended interaction. Production chat still needs retrieval, citations, refusal behavior, and answer validation.</small></span></div>
      </div>
      <footer><label className="chat-input"><input placeholder="Ask about this study..." disabled/><button className="primary-button" disabled><SendHorizontal size={16}/>Send</button></label></footer>
    </div>
  </div>;
}

function SettingsModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [autoRedact, setAutoRedact] = useState(true);
  const [quoteMode, setQuoteMode] = useState(true);
  const [expiry, setExpiry] = useState("7");
  return <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="settings-panel">
      <header>
        <div><span className="eyebrow">WORKSPACE SETTINGS</span><h2>Settings</h2></div>
        <button aria-label="Close settings" onClick={onClose}><X size={20}/></button>
      </header>
      <section>
        <h3>Analysis</h3>
        <label className="switch-row"><span><b>Redact personal details</b><small>Use a private analysis copy by default.</small></span><input type="checkbox" checked={autoRedact} onChange={event => setAutoRedact(event.target.checked)}/></label>
        <label className="switch-row"><span><b>Require exact quotes</b><small>Hide findings that are not linked to a transcript passage.</small></span><input type="checkbox" checked={quoteMode} onChange={event => setQuoteMode(event.target.checked)}/></label>
      </section>
      <section>
        <h3>Sharing</h3>
        <label>Default link expiry<select value={expiry} onChange={event => setExpiry(event.target.value)}><option value="1">After 24 hours</option><option value="7">After 7 days</option><option value="30">After 30 days</option></select></label>
      </section>
      <section>
        <h3>Workspace</h3>
        <div className="settings-account"><span>MA</span><div><b>Matilda Anashie</b><small>Solo researcher workspace</small></div></div>
      </section>
      <footer><button className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onSave}>Save settings</button></footer>
    </aside>
  </div>;
}

function Welcome({ onExplore, onCreate }: { onExplore: () => void; onCreate: () => void }) {
  return <div className="welcome"><header><div className="welcome-brand"><Sprout size={27}/><span><b>Glean</b><small>Powered by Folde</small></span></div></header><main><span className="eyebrow">WELCOME TO GLEAN</span><h1>From interviews to a report you can stand behind.</h1><p>Add conversations, verify the findings against exact quotes, then export a clear research report.</p><div className="welcome-steps"><JourneyLine number="1" title="Add interviews" text="Paste or upload 5–20 conversations." complete={false}/><JourneyLine number="2" title="Review findings" text="Approve only what the source supports." complete={false}/><JourneyLine number="3" title="Present report" text="Export a stakeholder-ready synthesis." complete={false}/></div><div className="welcome-actions"><button className="primary-button" onClick={onExplore}>Explore a sample study<ArrowRight size={17}/></button><button className="text-button" onClick={onCreate}>Create a blank study</button></div></main></div>;
}

function executiveSummary(study: Study) {
  const approved = study.themes.filter(theme => theme.status === "approved");
  if (!approved.length) return "This report is waiting for approved findings. Review the draft patterns and verify their source quotes before sharing conclusions.";
  return `${study.interviews.length} interviews suggest that people lose confidence before reaching a clear first success. The strongest opportunity is to make the intended outcome visible earlier and guide users toward one safe, achievable next step.`;
}

function emptyStudy(): Study {
  return { id: `study-${Date.now()}`, title: "Untitled research study", goal: "Define the decision this research should inform.", context: "", targetUsers: "", questions: [], hypotheses: "", status: "draft", updatedAt: "just now", interviews: [], themes: [] };
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
