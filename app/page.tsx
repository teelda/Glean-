"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, ChevronUp, Bot, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardList, Download, Eye, FileText, FolderOpen, Home, Lightbulb,
  LockKeyhole, Menu, MessageSquareText, MoreHorizontal, Plus, Quote,
  Save, Search, SendHorizontal, Settings, Share2, Sparkles, Sprout, Trash2, Upload, X
} from "lucide-react";
import { sampleStudy } from "@/lib/sample-data";
import type { Evidence, Interview, Study, Theme, ThemeStatus } from "@/lib/types";
import type { FormDraft, FormLogic, FormQuestion, FormSection } from "@/lib/form-import";
import { Dialog } from "./components/Dialog";
import { buildEvidenceCsv, buildWordReport, executiveSummary } from "@/lib/export";
import {
  buildContextFormDraft, encodeFormDraftForUrl, isLegacyContextValue,
  removeContextEchoQuestions, segmentResearchDoc, slugify, splitDraftByPurpose, titleCase
} from "@/lib/form-import";

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
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<FileList | null>(null);
  const [loaded, setLoaded] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const stored = window.localStorage.getItem("glean-study-v1");
    if (stored) {
      try { setStudy(JSON.parse(stored)); } catch { /* keep demo data */ }
    }
    setShowWelcome(!window.localStorage.getItem("glean-onboarded"));
    setLoaded(true);
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "forms") return setArea("forms");
      if (hash === "studies") return setArea("studies");
      if (hash === "report") {
        setArea("study");
        return setStage("report");
      }
      if (hash === "interviews") {
        setArea("study");
        return setStage("interviews");
      }
      if (hash === "findings") {
        setArea("study");
        return setStage("findings");
      }
      if (hash === "home") return setArea("home");
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    // Wait for the stored study to land first: writing on the mount pass would
    // persist the initial demo study over it, before the hydrating setState
    // commits. Once `loaded` flips, this re-runs with the real value.
    if (!loaded) return;
    window.localStorage.setItem("glean-study-v1", JSON.stringify(study));
  }, [study, loaded]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const approved = study.themes.filter(theme => theme.status === "approved").length;
  const reviewed = study.themes.filter(theme => theme.status !== "draft").length;
  const readiness = study.themes.length ? Math.round((reviewed / study.themes.length) * 100) : 0;
  const safeIndex = Math.min(findingIndex, Math.max(study.themes.length - 1, 0));
  const selectedTheme = study.themes[safeIndex] ?? null;

  const notify = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  const openArea = (nextArea: Area) => {
    setArea(nextArea);
    setMobileNav(false);
    if (window.location.hash !== `#${nextArea}`) window.history.pushState(null, "", `#${nextArea}`);
  };

  const openStudy = (nextStage: Stage = "findings") => {
    setArea("study");
    setStage(nextStage);
    setMobileNav(false);
    if (window.location.hash !== `#${nextStage}`) window.history.pushState(null, "", `#${nextStage}`);
  };

  // Starting a new study replaces everything in the workspace. It is the only
  // destructive action in the app, so it always asks first.
  const hasWork = study.interviews.length > 0 || study.themes.length > 0;
  const [pendingArea, setPendingArea] = useState<"studies" | "interviews">("studies");

  const startNewStudy = (destination: "studies" | "interviews") => {
    setPendingArea(destination);
    if (!hasWork) return commitNewStudy(destination);
    setConfirmReset(true);
  };

  const commitNewStudy = (destination: "studies" | "interviews") => {
    setStudy(emptyStudy());
    setFindingIndex(0);
    setConfirmReset(false);
    if (destination === "studies") openArea("studies");
    else openStudy("interviews");
    notify("New study started");
  };

  const removeInterview = (id: string) => {
    setStudy(current => {
      const interview = current.interviews.find(item => item.id === id);
      if (!interview) return current;
      return {
        ...current,
        interviews: current.interviews.filter(item => item.id !== id),
        // Findings quoting this interview are no longer fully supported.
        status: current.themes.length ? "stale" : current.status,
        updatedAt: "just now"
      };
    });
    notify("Interview removed");
  };

  const changeStatus = (id: string, status: ThemeStatus) => {
    setStudy(current => ({
      ...current,
      themes: current.themes.map(theme => theme.id === id ? { ...theme, status } : theme)
    }));
    notify(status === "approved" ? "Finding approved" : status === "rejected" ? "Finding rejected" : "Finding moved to review");
  };

  const addInterviews = (interviews: Interview[]) => {
    setStudy(current => ({ ...current, interviews: [...current.interviews, ...interviews], status: "stale", updatedAt: "just now" }));
    setShowAdd(false);
    setStage("interviews");
    notify(interviews.length === 1 ? `${interviews[0].participant.code} is ready` : `${interviews.length} interviews are ready`);
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
    downloadFile("glean-evidence.csv", buildEvidenceCsv(study), "text/csv;charset=utf-8");
    setShowExport(false);
    notify("Evidence CSV downloaded");
  };

  const exportWord = () => {
    downloadFile("glean-research-report.doc", buildWordReport(study), "application/msword");
    setShowExport(false);
    notify("Word report downloaded");
  };

  return <div className="glean-app">
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>} 
    <Sidebar study={study} area={area} stage={stage} reviewed={reviewed} onArea={openArea} onStage={openStudy} onSettings={() => { setShowSettings(true); setMobileNav(false); }} mobileOpen={mobileNav}/>

    <main className="glean-main">
      <Topbar
        area={area}
        study={study}
        readiness={readiness}
        stage={stage}
        onMenu={() => setMobileNav(true)}
        onReport={() => openStudy("report")}
      />

      {area === "home" && <HomeView study={study} approved={approved} readiness={readiness} onContinue={() => openStudy(study.interviews.length ? "findings" : "interviews")} onNew={() => startNewStudy("studies")} onForms={() => openArea("forms")} onInterviews={() => openStudy("interviews")} onChat={() => setShowChat(true)}/>} 
      {area === "studies" && <StudiesView study={study} onOpen={() => openStudy(study.interviews.length ? "findings" : "interviews")} onNew={() => startNewStudy("interviews")} onForms={() => openArea("forms")}/>} 
      {area === "forms" && <FormsView study={study} onOpenStudy={() => openStudy("interviews")} onCopied={() => notify("Form link copied")}/>} 
      {area === "study" && stage === "interviews" && <InterviewsStage study={study} onAdd={() => setShowAdd(true)} onAnalyse={analyse} onDropFiles={setDroppedFiles} onRemove={removeInterview}/>} 
      {area === "study" && stage === "findings" && <FindingsStage
        study={study}
        theme={selectedTheme}
        index={safeIndex}
        onPrevious={() => setFindingIndex(index => Math.max(0, index - 1))}
        onNext={() => setFindingIndex(index => Math.min(study.themes.length - 1, index + 1))}
        onEvidence={setEvidence}
        onStatus={changeStatus}
        onAdd={() => setStage("interviews")}
        onAnalyse={analyse}
      />} 
      {area === "study" && stage === "report" && <ReportStage study={study} onReview={() => setStage("findings")} onExport={() => setShowExport(value => !value)} exportOpen={showExport} onPdf={() => { window.print(); setShowExport(false); }} onWord={exportWord} onCsv={exportEvidence}/>} 
    </main>

    {evidence && <EvidenceDrawer evidence={evidence} study={study} onClose={() => setEvidence(null)}/>} 
    {(showAdd || droppedFiles) && <AddInterviewModal study={study} initialFiles={droppedFiles} onClose={() => { setShowAdd(false); setDroppedFiles(null); }} onAddMany={addInterviews}/>} 
    {showChat && <ChatModal study={study} onClose={() => setShowChat(false)} onReview={() => { setShowChat(false); openStudy("findings"); }}/>} 
    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSave={() => { setShowSettings(false); notify("Settings saved"); }}/>} 
    {confirmReset && <ConfirmDialog
      title="Start a new study?"
      body={`This replaces the current study. ${study.interviews.length} ${study.interviews.length === 1 ? "interview" : "interviews"} and ${study.themes.length} ${study.themes.length === 1 ? "finding" : "findings"} will be permanently removed from this workspace, including any approvals. Export your evidence first if you need to keep it.`}
      confirmLabel="Replace study"
      onCancel={() => setConfirmReset(false)}
      onConfirm={() => commitNewStudy(pendingArea)}
    />}
    {showWelcome && <Welcome onExplore={() => { window.localStorage.setItem("glean-onboarded", "true"); setShowWelcome(false); }} onCreate={() => { window.localStorage.setItem("glean-onboarded", "true"); setStudy(emptyStudy()); setShowWelcome(false); openArea("studies"); }}/>} 
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
    <a className="glean-brand" href="#home" onClick={() => onArea("home")} aria-label="Glean home"><span><Sprout size={26}/></span><span><b>Glean</b><small>Powered by Folde</small></span></a>
    <nav className="global-nav" aria-label="Primary navigation">
      <a className={area === "home" ? "active" : ""} href="#home" onClick={() => onArea("home")}><Home size={20}/>Home</a>
      <a className={area === "studies" || (area === "study" && stage !== "report") ? "active" : ""} href="#studies" onClick={() => onArea("studies")}><FolderOpen size={20}/>Studies</a>
      <a className={area === "forms" ? "active" : ""} href="#forms" onClick={() => onArea("forms")}><ClipboardList size={20}/>Forms</a>
      <a className={area === "study" && stage === "report" ? "active" : ""} href="#report" onClick={() => onStage("report")}><FileText size={20}/>Reports</a>
    </nav>
    <section className="current-study-nav">
      <span className="nav-label">CURRENT STUDY</span>
      <a className="study-name" href={`#${stage}`} onClick={() => onStage(stage)}><span>{study.title}</span><ChevronRight size={16}/></a>
      <div className="journey-nav">
        {steps.map((step, index) => {
          const complete = step.id === "interviews" ? study.interviews.length > 0 : step.id === "findings" ? study.themes.length > 0 && reviewed === study.themes.length : false;
          return <a href={`#${step.id}`} key={step.id} className={area === "study" && stage === step.id ? "active" : ""} onClick={() => onStage(step.id)}>
            <span className={`step-marker ${complete ? "complete" : ""}`}>{complete ? <Check size={15}/> : index + 1}</span>
            <span><b>{step.label}</b><small>{step.meta}</small></span>
          </a>;
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

function HomeView({ study, approved, readiness, onContinue, onNew, onForms, onInterviews, onChat }: { study: Study; approved: number; readiness: number; onContinue: () => void; onNew: () => void; onForms: () => void; onInterviews: () => void; onChat: () => void }) {
  const reviewed = study.themes.filter(theme => theme.status !== "draft").length;
  const draftFindings = study.themes.length - approved;
  const topFinding = study.themes[0];
  return <section className="home-view page-pad">
    <div className="home-shell">
      <section className="home-copy">
        <span className="eyebrow">RESEARCH WORKSPACE</span>
        <h1>Turn research into decisions.</h1>
        <p>Glean helps you move from interviews, forms, and research documents to reviewed findings, exact quotes, and a report people can trust.</p>
        <div className="hero-actions">
          <button className="primary-button" onClick={onNew}>Start research<ArrowRight size={17}/></button>
          <button className="outline-button" onClick={onContinue}>Continue active work</button>
          <button className="text-button" onClick={onChat}><Bot size={17}/>Ask Glean</button>
        </div>
        <div className="research-type-grid" aria-label="Choose research type">
          <button onClick={onForms}><ClipboardList size={19}/><span><b>Create a form</b><small>Draft survey/research forms from goals, notes, DOCX, PDF, or TXT.</small></span></button>
          <button onClick={onInterviews}><MessageSquareText size={19}/><span><b>Analyse interviews</b><small>Upload transcripts and review themes tied to exact quotes.</small></span></button>
          <button onClick={onForms}><FileText size={19}/><span><b>Import a research doc</b><small>Extract mixed questions and split them into reviewable form drafts.</small></span></button>
        </div>
        <div className="home-detail-grid">
          <HomeDetail title="Evidence rule" value="Quote first" text="Every finding is shown with the exact participant quotes behind it, so you can verify a claim before you approve it."/>
          <HomeDetail title="Your data" value="Stays in this workspace" text="Raw transcripts are never included in an exported report or a shared link."/>
          <HomeDetail title="Sample size" value="5–20 interviews" text="Enough for patterns to repeat without taking longer to review than the research is worth."/>
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
        <p>{topFinding?.summary ?? "Choose a research path first: create a form, import an existing research doc, or add interview transcripts."}</p>
        <div className="summary-strip">
          <span><b>{readiness}%</b><small>Review readiness</small></span>
          <span><b>{study.status === "analysed" ? "Analysed" : study.status === "stale" ? "Needs re-analysis" : "Not analysed"}</b><small>Study status</small></span>
          <span><b>{study.updatedAt}</b><small>Last updated</small></span>
        </div>
      </section>
      <section className="home-chat-card">
        <div><span><Bot size={18}/></span><span><b>Study chat</b><small>Answers must come from interviews and approved findings.</small></span></div>
        <button className="chat-question" onClick={onChat}>What should we change in onboarding?</button>
        <button className="chat-question" onClick={onChat}>Which problems have the strongest support?</button>
        <button className="primary-button" onClick={onChat}>Open chat<SendHorizontal size={16}/></button>
      </section>
    </div>
    <div className="home-journey">
      <JourneyLine number="1" title="Choose research type" text="Forms, interviews, docs, or response analysis" complete/>
      <JourneyLine number="2" title="Collect or import data" text={`${study.interviews.length} interview sources in the active study`} complete={study.interviews.length > 0}/>
      <JourneyLine number="3" title="Review and share" text="Approve findings, export, or publish links" complete={approved > 0}/>
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
          <span className="study-monogram" aria-hidden="true">{(study.title.trim()[0] ?? "S").toUpperCase()}</span>
          <span><b>{study.title}</b><small>{study.goal}</small><em>{study.interviews.length} interviews · {study.themes.length} findings · Updated {study.updatedAt}</em></span>
          <span className={`status-chip ${study.status}`}>{study.status === "analysed" ? "In review" : study.status === "stale" ? "Needs re-analysis" : "Draft"}</span>
          <ChevronRight size={18}/>
        </button> : <div className="empty-search"><Search size={26}/><h3>No studies found</h3><p>Try a different title or research goal.</p></div>}
      </section>
      <aside className="research-side">
        <section><span className="eyebrow">NEXT BEST ACTION</span><h2>Generate a research form</h2><p>Give Glean the goal, audience, and decision. It drafts the screener, consent, and questions so you are editing structure instead of building from zero.</p><button className="primary-button" onClick={onForms}><Sparkles size={17}/>Start with context</button></section>
        <section><span className="eyebrow">WORKFLOW</span><ol className="research-flow">{["Brief", "Form", "Responses", "Findings"].map((step, index, all) =>
          <li key={step}>{index > 0 && <ChevronRight size={14} aria-hidden="true"/>}<span>{step}</span></li>)}</ol></section>
      </aside>
    </div>
  </section>;
}

function FormsView({ study, onOpenStudy, onCopied }: { study: Study; onOpenStudy: () => void; onCopied: () => void }) {
  const [generated, setGenerated] = useState(false);
  const [published, setPublished] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [responses, setResponses] = useState<{ id: string; answers: Record<string, string>; createdAt: string }[]>([]);
  const [moved, setMoved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expiry, setExpiry] = useState("7 days");
  const [anonymous, setAnonymous] = useState(true);
  const [origin, setOrigin] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [setupStep, setSetupStep] = useState<"source" | "context" | "review">("source");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewRequested, setReviewRequested] = useState(false);
  const [reviewApproved, setReviewApproved] = useState(false);
  const [reviewComment, setReviewComment] = useState("Tighten sensitive questions before publishing.");
  const [publishing, setPublishing] = useState(false);
  const [backendMode, setBackendMode] = useState("");
  const [backendFormId, setBackendFormId] = useState("");
  const [backendShareUrl, setBackendShareUrl] = useState("");
  const [formName, setFormName] = useState("");
  const [researchGoal, setResearchGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [decision, setDecision] = useState("");
  const [sections, setSections] = useState<FormSection[]>([
    { id: "section-1", title: "Screening", questions: [
      { id: "q1", text: "Which best describes your relationship to this topic or product area?", type: "single", options: ["Current user", "Past user", "Exploring options", "New to this area"] }
    ] },
    { id: "section-2", title: "Experience", questions: [
      { id: "q2", text: "What problem, need, or pain point should we understand first?", type: "open", options: [] },
      { id: "q3", text: "What have you already tried, and what made those options work or fall short?", type: "open", options: [] },
      { id: "q4", text: "How important is solving this problem to you right now?", type: "scale", options: ["1", "2", "3", "4", "5"] }
    ] }
  ]);
  const [drafts, setDrafts] = useState<FormDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    const stored = window.localStorage.getItem("glean-form-draft-v1");
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as { formName?: string; researchGoal?: string; audience?: string; decision?: string; sections?: FormSection[]; drafts?: FormDraft[]; activeDraftId?: string; generated?: boolean; published?: boolean };
      const restoredFormName = draft.formName && !isLegacyContextValue("formName", draft.formName) ? draft.formName : "";
      if (restoredFormName) setFormName(restoredFormName);
      if (draft.researchGoal && !isLegacyContextValue("researchGoal", draft.researchGoal)) setResearchGoal(draft.researchGoal);
      if (draft.audience && !isLegacyContextValue("audience", draft.audience)) setAudience(draft.audience);
      if (draft.decision && !isLegacyContextValue("decision", draft.decision)) setDecision(draft.decision);
      if (draft.sections?.length) setSections(removeContextEchoQuestions(draft.sections, restoredFormName || draft.formName || ""));
      if (draft.drafts?.length) setDrafts(draft.drafts.map(item => ({ ...item, sections: removeContextEchoQuestions(item.sections, item.name) })));
      if (draft.activeDraftId) setActiveDraftId(draft.activeDraftId);
      if (draft.generated) setGenerated(true);
      if (draft.published) setPublished(true);
    } catch { /* keep default form */ }
  }, []);
  const questionCount = sections.reduce((total, section) => total + section.questions.length, 0);
  const formSlug = slugify(formName || "research-form");
  const formPath = `/forms/${formSlug}`;
  const encodedDraft = encodeFormDraftForUrl({ name: formName, sections });
  const shareUrl = backendShareUrl || `${origin || "http://localhost:3210"}${formPath}${encodedDraft ? `?draft=${encodedDraft}` : ""}`;
  const activeDraft = drafts.find(draft => draft.id === activeDraftId);
  const importedActiveDraft = Boolean(activeDraft && activeDraft.source !== "Generated from context");
  const hasContextForDraft = Boolean(formName.trim() && researchGoal.trim() && audience.trim() && decision.trim());
  const selectDraft = (draft: FormDraft) => {
    setActiveDraftId(draft.id);
    setFormName(draft.name);
    setSections(draft.sections);
    setResearchGoal(draft.goal ?? `Review questions imported from ${draft.source}.`);
    setAudience(draft.audience);
    setDecision(draft.purpose);
    setPublished(draft.status === "Published");
    setGenerated(true);
    setShowEditor(true);
  };
  const syncDraft = (patch: Partial<FormDraft>) => {
    if (!activeDraftId) return;
    setDrafts(current => current.map(draft => draft.id === activeDraftId ? { ...draft, name: formName, goal: researchGoal, audience, purpose: decision, sections, ...patch } : draft));
  };
  useEffect(() => {
    if (!activeDraftId) return;
    setDrafts(current => current.map(draft => draft.id === activeDraftId ? { ...draft, name: formName, goal: researchGoal, audience, purpose: decision, sections } : draft));
  }, [formName, researchGoal, audience, decision, sections, activeDraftId]);
  const importResearchDoc = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage(`Extracting ${file.name}…`);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/research-docs/parse", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not parse document");
      const nextDrafts = segmentResearchDoc(result.text, result.fileName);
      if (!nextDrafts.length) throw new Error("Glean could not find usable questions in this document. Try a text-based DOCX/PDF or paste the questions.");
      setDrafts(nextDrafts);
      selectDraft(nextDrafts[0]);
      setSetupStep("review");
      setImportMessage(result.warning ?? `${nextDrafts[0].sections.reduce((total, section) => total + section.questions.length, 0)} questions from ${result.fileName} are now editable in the form fields.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not import this document.");
    } finally {
      setImporting(false);
    }
  };
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
  const addConsentSection = () => setSections(current => [
    {
      id: `section-consent-${Date.now()}`,
      title: "Consent and participant fit",
      questions: [
        { id: `q-consent-${Date.now()}`, text: "Do you consent to your anonymised response being used for this research?", type: "single", options: ["Yes", "No"], consent: true },
        { id: `q-fit-${Date.now()}`, text: "Which option best describes your relationship to this topic?", type: "single", options: ["Currently experiencing it", "Exploring options", "Have experience with it", "Prefer not to say"] }
      ]
    },
    ...current
  ]);
  const addQuestion = (sectionId: string) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: [...section.questions, { id: `q-${Date.now()}`, text: "New question", type: "open", options: [] }] } : section));
  const deleteSection = (sectionId: string) => setSections(current => current.length <= 1 ? current : current.filter(section => section.id !== sectionId).map(section => ({ ...section, questions: section.questions.map(question => question.logic?.targetSectionId === sectionId ? { ...question, logic: undefined } : question) })));
  const deleteQuestion = (sectionId: string, questionId: string) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: section.questions.filter(question => question.id !== questionId) } : section));
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
  const deleteOption = (sectionId: string, questionId: string, optionIndex: number) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: section.questions.map(question => {
    if (question.id !== questionId) return question;
    const removed = question.options[optionIndex];
    return { ...question, options: question.options.filter((_, index) => index !== optionIndex), logic: question.logic?.option === removed ? { ...question.logic, option: "" } : question.logic };
  }) } : section));
  const updateQuestionLogic = (sectionId: string, questionId: string, logic: FormLogic) => setSections(current => current.map(section => section.id === sectionId ? { ...section, questions: section.questions.map(question => question.id === questionId ? { ...question, logic: logic.targetSectionId ? logic : undefined } : question) } : section));
  const saveDraft = () => {
    const draft: FormDraft = { id: activeDraftId || `draft-saved-${Date.now()}`, name: formName.trim() || "Untitled research form", goal: researchGoal, purpose: decision, audience, status: "Draft", sections, source: activeDraft?.source ?? "Saved draft" };
    setDrafts(current => activeDraftId && current.some(item => item.id === activeDraftId) ? current.map(item => item.id === activeDraftId ? { ...item, ...draft, id: activeDraftId } : item) : [draft, ...current]);
    setActiveDraftId(draft.id);
    setGenerated(true);
    setPublished(false);
    window.localStorage.setItem("glean-form-draft-v1", JSON.stringify({ formName, researchGoal, audience, decision, sections, drafts: activeDraftId ? drafts.map(item => item.id === activeDraftId ? { ...item, ...draft, id: activeDraftId } : item) : [draft, ...drafts], activeDraftId: draft.id, generated: true, published: false }));
    setImportMessage("Draft saved. You can leave this page and come back to keep editing.");
  };
  const publishToBackend = async () => {
    if (!formName.trim()) {
      setImportMessage("Give the form a name before publishing — respondents see it at the top of the page.");
      setSetupStep("context");
      return;
    }
    setPublishing(true);
    setImportMessage("Creating a test link…");
    try {
      const response = await fetch("/api/forms/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: backendFormId || undefined, name: formName.trim(), slug: formSlug, sections })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not publish form");
      const token = result.form?.token;
      if (!token) throw new Error("Backend did not return a public token");
      setBackendMode(result.mode ?? "");
      setBackendFormId(result.form.id);
      setBackendShareUrl(`${origin || "http://localhost:3210"}/forms/${result.form.slug}?token=${token}`);
      setGenerated(true);
      setPublished(true);
      setShowPreview(true);
      syncDraft({ status: "Published" });
      setImportMessage(result.mode === "supabase" ? "Published. Responses will be collected for this form." : "Published for local testing. Responses will be collected on this device while the dev server is running.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not create backend link.");
    } finally {
      setPublishing(false);
    }
  };
  const refreshBackendResponses = async () => {
    if (!backendFormId) {
      setImportMessage("Publish the form before loading responses.");
      return;
    }
    try {
      const response = await fetch(`/api/forms/responses?formId=${encodeURIComponent(backendFormId)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load responses");
      const rows = result.responses ?? [];
      setResponses(rows);
      setBackendMode(result.mode ?? backendMode);
      setImportMessage(rows.length
        ? `${rows.length} ${rows.length === 1 ? "response" : "responses"} loaded.`
        : "No responses yet. Share the link, or submit a test response yourself.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not load responses.");
    }
  };

  const generateForm = () => {
    if (importedActiveDraft) {
      setImportMessage("This form is using questions extracted from your document. Edit these fields directly, or start a new form if you want a context-generated version.");
      return;
    }
    if (!hasContextForDraft) {
      setImportMessage("Add the form name, research goal, audience, and decision in the Context tab before drafting from context.");
      return;
    }
    const draft = buildContextFormDraft({ formName, researchGoal, audience, decision });
    setSections(draft.sections);
    setDrafts(current => {
      if (!activeDraftId) return [draft, ...current];
      return current.map(item => item.id === activeDraftId ? { ...item, ...draft, id: item.id } : item);
    });
    setActiveDraftId(current => current || draft.id);
    setGenerated(true);
    setPublished(false);
    setShowEditor(true);
    setSetupStep("review");
    setImportMessage(`Drafted ${draft.sections.reduce((total, section) => total + section.questions.length, 0)} editable questions from your research context.`);
  };
  const requestReview = async () => {
    if (!reviewerEmail.trim()) {
      setImportMessage("Add a reviewer email before requesting review.");
      return;
    }
    setImportMessage("Sending review invite…");
    try {
      const response = await fetch("/api/forms/review-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: reviewerEmail.trim(),
          formName: formName || "this Glean form",
          note: reviewComment,
          shareUrl: published ? shareUrl : "",
          status: published ? "published" : "draft"
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send invite");
      setReviewRequested(true);
      setReviewApproved(false);
      setImportMessage(`Invite sent to ${reviewerEmail.trim()}.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not send invite.");
    }
  };
  return <section className="forms-view page-pad">
    <div className="research-header">
      <div><span className="eyebrow">RESEARCH FORMS</span><h1>Create a form without starting from scratch.</h1><p>Upload a research plan or describe what you need to learn. Glean turns it into editable form drafts you can review, publish, and analyse.</p></div>
      <button className="outline-button" onClick={onOpenStudy}><Upload size={17}/>Analyse interviews</button>
    </div>
    <div className="form-builder-grid">
      <section className="form-context-panel">
        <div className="setup-panel-head"><span className="eyebrow">FORM SETUP</span><h2>Prepare the draft</h2><p>Bring in source material, confirm the research context, then decide whether this needs team review before sharing.</p></div>
        <div className="setup-switcher" role="tablist" aria-label="Form setup steps">
          <button className={setupStep === "source" ? "active" : ""} onClick={() => setSetupStep("source")}><span>1</span>Source</button>
          <button className={setupStep === "context" ? "active" : ""} onClick={() => setSetupStep("context")}><span>2</span>Context</button>
          <button className={setupStep === "review" ? "active" : ""} onClick={() => setSetupStep("review")}><span>3</span>Review</button>
        </div>
        <div className={`setup-step ${setupStep === "source" ? "active" : ""}`}>
          <div className="setup-content">
            <div className="setup-label"><b>Start with a source</b><small>Import a document, or start from context if you do not have one yet.</small></div>
            <div className="source-picker">
              <label className="doc-import-card source-primary"><span><FileText size={22}/></span><b>{importing ? "Extracting document…" : "Import document"}</b><small>DOCX, PDF, or TXT</small><input type="file" accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={event => { const files = event.currentTarget.files; importResearchDoc(files).catch(error => setImportMessage(readableError(error))); event.currentTarget.value = ""; }}/></label>
              <button className="source-secondary source-cta" onClick={() => setSetupStep("context")} type="button"><span><Sparkles size={17}/></span><b>No document?</b><small>Start from context</small><ChevronRight size={15}/></button>
            </div>
            {importMessage && <div className={`import-status ${importing ? "loading" : ""}`}><Sparkles size={15}/><span>{importMessage}</span></div>}
            {drafts.length > 0 && <div className="draft-stack">
              <div><span className="eyebrow">DRAFTS</span><b>{drafts.length === 1 ? "1 editable draft" : `${drafts.length} editable drafts`}</b><small>Your uploaded document, plus any focused forms you split out of it.</small></div>
              {drafts.map(draft => <button key={draft.id} className={draft.id === activeDraftId ? "active" : ""} onClick={() => selectDraft(draft)}><span><b>{draft.name}</b><small>{draft.purpose}</small></span><em>{draft.status}</em></button>)}
              {activeDraft && drafts.length === 1 && <button className="text-button" onClick={() => {
                const split = splitDraftByPurpose(activeDraft);
                if (!split.length) { setImportMessage("There are not enough questions to split into focused forms."); return; }
                setDrafts(current => [...current, ...split]);
                setImportMessage(`Split into ${split.length} focused ${split.length === 1 ? "form" : "forms"} by question purpose. Your full import is untouched.`);
              }}><Sparkles size={14}/>Split into focused forms</button>}
            </div>}
            <button className="setup-next" onClick={() => setSetupStep("context")}>Continue to context<ChevronRight size={15}/></button>
          </div>
        </div>
        <div className={`setup-step ${setupStep === "context" ? "active" : ""}`}>
          <div className="setup-content">
            <div className="setup-label"><b>Research context</b><small>Required if you do not import a document. These fields tell Glean what to draft.</small></div>
            <label>Form name<input value={formName} onChange={event => setFormName(event.target.value)} placeholder="e.g. Feminine wellness discovery form"/></label>
            <label>Research goal<textarea rows={4} value={researchGoal} onChange={event => setResearchGoal(event.target.value)} placeholder="What are you trying to learn or validate?"/></label>
            <label>Audience<input value={audience} onChange={event => setAudience(event.target.value)} placeholder="Who should answer this form?"/></label>
            <label>Decision this should inform<input value={decision} onChange={event => setDecision(event.target.value)} placeholder="What decision should these answers support?"/></label>
            <button className="context-draft-button" onClick={generateForm} disabled={importedActiveDraft || !hasContextForDraft}><Sparkles size={16}/>Draft form from context</button>
            {!hasContextForDraft && <p className="context-hint">Complete the four context fields to draft without uploading a document.</p>}
            <button className="setup-next" onClick={() => setSetupStep("review")}>Continue to review<ChevronRight size={15}/></button>
          </div>
        </div>
        <div className={`setup-step setup-step-last ${setupStep === "review" ? "active" : ""}`}>
          <div className="setup-content">
            <div className="setup-label"><b>Review with others</b><small>Send a private review invite, collect feedback, then mark approved when the form is ready to publish.</small></div>
            <div className="review-flow-card">
              <div className="review-progress">
                <span className="done">Draft</span>
                <span className={reviewRequested ? "done" : ""}>Requested</span>
                <span className={reviewApproved ? "done" : ""}>Approved</span>
              </div>
              <label>Reviewer email<input value={reviewerEmail} onChange={event => setReviewerEmail(event.target.value)} placeholder="teammate@company.com"/></label>
              <label>Reviewer note<textarea rows={3} value={reviewComment} onChange={event => setReviewComment(event.target.value)} placeholder="What should they check?"/></label>
              <div className="review-actions">
                <button className="outline-button" onClick={requestReview}><SendHorizontal size={15}/>{reviewRequested ? "Resend invite" : "Send invite"}</button>
                <button className="primary-button" onClick={() => { setReviewRequested(true); setReviewApproved(true); setImportMessage("Review marked approved for this prototype."); }} disabled={!questionCount}><Check size={15}/>Mark approved</button>
              </div>
              {reviewRequested && <div className="review-notes refined"><p><b>{reviewerEmail || "Reviewer"}</b> {reviewComment || "Review requested."}</p>{reviewApproved && <p><b>Status</b> Approved for test publishing.</p>}</div>}
            </div>
          </div>
        </div>
      </section>
      <section className="form-preview-panel">
        <div className="section-bar"><div><span className="eyebrow">{published ? "PUBLIC FORM" : "FORM BUILDER"}</span><h2>{generated ? formName : "Review and shape the form"}</h2></div><span className={`status-chip ${published ? "published" : ""}`}>{published ? "Published" : "Draft"}</span><span className="question-count">{questionCount} {questionCount === 1 ? "question" : "questions"}</span></div>
        <div className="builder-toolbar refined-toolbar">
          <div className="toolbar-status">
            <span>{importedActiveDraft ? <Check size={15}/> : <Sparkles size={15}/>}</span>
            <div><b>{published ? "Published" : importedActiveDraft ? "Imported draft" : generated ? "Generated draft" : "Draft not generated"}</b><small>{published ? "Live at the link below. Publishing again updates this same form and keeps the responses you already have." : importedActiveDraft ? "Questions came from your upload. Clean them up before sharing." : generated ? "Save and preview, then publish when it is ready." : "Generate from context or upload a document to begin."}</small></div>
          </div>
          <div className="toolbar-actions" aria-label="Form builder actions">
            {!importedActiveDraft && !generated && <button className="toolbar-secondary action-generate" onClick={generateForm}><Sparkles size={15}/>Generate</button>}
            <button className="toolbar-secondary" onClick={saveDraft} disabled={!questionCount}><Save size={15}/>Save</button>
            <button className="toolbar-secondary" onClick={() => setShowPreview(value => !value)} disabled={!questionCount}><Eye size={15}/>{showPreview ? "Hide" : "Preview"}</button>
            <button className="toolbar-primary" onClick={publishToBackend} disabled={!questionCount || publishing}><Share2 size={15}/>{publishing ? "Publishing…" : published ? "Update published form" : "Publish"}</button>
          </div>
        </div>
        {importMessage && <div className={`import-status canvas-status ${importing ? "loading" : ""}`}><Sparkles size={15}/><span>{importMessage}</span></div>}
        {importedActiveDraft && <div className="imported-source-card"><span className="eyebrow">IMPORTED FROM DOCUMENT</span><h3>{activeDraft?.name}</h3><p>Questions from your uploaded file are loaded below without forced consent or screener sections. Add them only if this will be shared with external respondents.</p><button className="text-button" onClick={addConsentSection}><Plus size={14}/>Add consent/screener</button></div>}
        {published && <div className="form-share-card">
          <header>
            <span className="published-icon"><Share2 size={18}/></span>
            <div>
              <span className="eyebrow">RESPONDENT LINK</span>
              <h3>{formName} is live</h3>
              <p>Share this link with respondents. They will only see the clean form, not your builder, drafts, sections editor, or review notes.</p>
            </div>
            
          </header>
          <div className="share-link-row"><code>{shareUrl}</code><button onClick={copyShareLink}>Copy link</button><a href={shareUrl} target="_blank" rel="noreferrer">Open form</a></div>
          <div className="share-settings">
            <label>Link expiry<select value={expiry} onChange={event => setExpiry(event.target.value)}><option>7 days</option><option>14 days</option><option>30 days</option><option>No expiry for this test</option></select></label>
            <label className="checkbox-row"><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)}/><span>Collect anonymous responses</span></label>
          </div>
          <small>{anonymous ? "Names and emails are not requested on the respondent form." : "Respondent identity collection is off in this prototype until consent fields are configured."} {backendFormId ? "Responses from this link appear in your dashboard." : "Publish to collect responses."}</small>
        </div>}
        {(showPreview || published) && <div className="public-form-preview">
          <div className="preview-paper">
            <span className="respondent-badge">Question summary</span>
            <h3>{formName}</h3>
            <p>Help the research team understand your experience, pain points, and what would make a better solution feel useful and trustworthy.</p>
            {sections.map((section, sectionIndex) => <section className="preview-section" key={`preview-${section.id}`}><small>Section {sectionIndex + 1} · {section.questions.length} {section.questions.length === 1 ? "question" : "questions"}</small><h4>{section.title}</h4>{section.questions.map((question, index) => <div className="preview-question" key={question.id}><span>{index + 1}</span><b>{question.text}</b><em>{question.type === "open" ? "Long answer" : question.type === "single" ? "Multiple choice" : "Rating scale"}{question.logic?.targetSectionId ? ` · can skip to ${sections.find(item => item.id === question.logic?.targetSectionId)?.title ?? "another section"}` : ""}</em></div>)}</section>)}
            {published ? <a className="primary-button" href={shareUrl} target="_blank" rel="noreferrer">Open the respondent form<ArrowRight size={16}/></a> : <p className="preview-note">Publish to see and share the respondent form.</p>}
          </div>
        </div>}
        {showEditor && <div className="editor-disclosure"><div><span className="eyebrow">{published ? "OWNER ONLY" : "EDIT FORM"}</span><h3>{published ? "Edit form sections" : "Form sections"}</h3><p>{published ? "These sections are only visible to you. People who open the link answer one section at a time." : "Add, rename, reorder, and tune the questions before publishing."}</p></div></div>}
        {showEditor && <div className="editable-form">{sections.map((section, sectionIndex) => <section key={section.id} className="editable-section">
          <div className="section-editor-head"><label>Section {sectionIndex + 1}<input value={section.title} onChange={event => updateSection(section.id, event.target.value)}/></label><button className="danger-icon" onClick={() => deleteSection(section.id)} disabled={sections.length <= 1} aria-label={`Delete section ${sectionIndex + 1}`}><Trash2 size={15}/></button></div>
          {section.questions.map((question, questionIndex) => <article key={question.id} className="editable-question">
            <div className="question-topline"><span>{questionIndex + 1}</span><QuestionTypeDropdown value={question.type} onChange={type => updateQuestion(section.id, question.id, { type, options: type === "single" ? question.options.length ? question.options : ["Option 1", "Option 2"] : type === "scale" ? ["1", "2", "3", "4", "5"] : [], logic: type === "open" ? undefined : question.logic })}/><button onClick={() => moveQuestion(section.id, question.id, -1)} disabled={questionIndex === 0} aria-label="Move question up"><ChevronUp size={15}/></button><button onClick={() => moveQuestion(section.id, question.id, 1)} disabled={questionIndex === section.questions.length - 1} aria-label="Move question down"><ChevronDown size={15}/></button><button className="danger-icon" onClick={() => deleteQuestion(section.id, question.id)} aria-label={`Delete question ${questionIndex + 1}`}><Trash2 size={15}/></button></div>
            <textarea rows={2} value={question.text} onChange={event => updateQuestion(section.id, question.id, { text: event.target.value })}/>
            {question.type === "scale"
              ? <div className="scale-editor">
                  <label>Points
                    <select value={question.options.length} onChange={event => updateQuestion(section.id, question.id, { options: Array.from({ length: Number(event.target.value) }, (_, step) => String(step + 1)) })}>
                      {[3, 5, 7, 10].map(points => <option key={points} value={points}>1–{points}</option>)}
                    </select>
                  </label>
                  <div className="scale-preview" aria-hidden="true">{question.options.map(option => <span key={option}>{option}</span>)}</div>
                </div>
              : question.options.length > 0 && <div className="option-list">
                  {question.options.map((option, optionIndex) => <div className="option-row" key={`${question.id}-${optionIndex}`}>
                    <input value={option} onChange={event => updateOption(section.id, question.id, optionIndex, event.target.value)} aria-label={`Option ${optionIndex + 1}`}/>
                    <button className="danger-icon" onClick={() => deleteOption(section.id, question.id, optionIndex)} disabled={question.options.length <= 2} aria-label={`Delete option ${optionIndex + 1}`}><Trash2 size={14}/></button>
                  </div>)}
                  {question.type === "single" && <button className="text-button" onClick={() => addOption(section.id, question.id)}><Plus size={14}/>Add option</button>}
                </div>}
            <details className="branch-rule" open={Boolean(question.logic?.targetSectionId)}><summary>{question.logic?.targetSectionId ? `Branches to ${sections.find(item => item.id === question.logic?.targetSectionId)?.title ?? "another section"}` : "Add branching"}</summary><div>{question.type === "single" && question.options.length > 0 && <label>When answer is<select value={question.logic?.option ?? ""} onChange={event => updateQuestionLogic(section.id, question.id, { ...question.logic, option: event.target.value, targetSectionId: question.logic?.targetSectionId ?? "" })}><option value="">Any answer</option>{question.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>}<label>Then go to<select value={question.logic?.targetSectionId ?? ""} onChange={event => updateQuestionLogic(section.id, question.id, { ...question.logic, targetSectionId: event.target.value })}><option value="">Next section</option>{sections.filter(item => item.id !== section.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div></details>
          </article>)}
          <div className="section-actions"><button className="text-button add-question" onClick={() => addQuestion(section.id)}><Plus size={15}/>Add question</button>{sectionIndex === sections.length - 1 && <button className="text-button add-question" onClick={addSection}><Plus size={15}/>Add section</button>}</div>
        </section>)}</div>}
        <div className="responses-panel">
          <div className="section-bar">
            <div>
              <span className="eyebrow">RESPONSES</span>
              <h3>{responses.length} collected</h3>
              <p>{published
                ? "Answers submitted through your respondent link. Read them here, then bring them into the study as an evidence source."
                : "Publish the form before collecting responses."}</p>
            </div>
          </div>
          <div className="response-actions">
            <button className="outline-button" onClick={refreshBackendResponses} disabled={!published}><MessageSquareText size={16}/>Refresh responses</button>
            <button className="primary-button" disabled={!responses.length} onClick={() => setMoved(true)}><BarChart3 size={16}/>Move to analyser</button>
          </div>
          {moved && <div className="analysis-ready"><Check size={16}/><span>Responses are queued for the analyser. Reading them into findings is not built yet, so nothing has been added to the study.</span></div>}
          {responses.length > 0 && <ol className="response-list">
            {responses.map((response, index) => {
              const questions = sections.flatMap(section => section.questions);
              return <li key={response.id}>
                <div className="response-head">
                  <b>Response {responses.length - index}</b>
                  <small>{new Date(response.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small>
                </div>
                <dl>
                  {questions.filter(question => (response.answers[question.id] ?? "").trim()).map(question =>
                    <div key={question.id}>
                      <dt>{question.text}</dt>
                      <dd>{response.answers[question.id]}</dd>
                    </div>)}
                </dl>
              </li>;
            })}
          </ol>}
        </div>
      </section>
    </div>
  </section>;
}

const questionTypeOptions: { value: FormQuestion["type"] | "checkboxes" | "ranking" | "file"; label: string; hint: string; disabled?: boolean }[] = [
  { value: "open", label: "Text answer", hint: "Long or short written response" },
  { value: "single", label: "Single choice", hint: "One answer from a set of options" },
  { value: "scale", label: "Rating scale", hint: "1–5 or numeric sentiment scale" },
  { value: "checkboxes", label: "Checkboxes", hint: "Multiple selections — soon", disabled: true },
  { value: "ranking", label: "Ranking", hint: "Prioritise options — soon", disabled: true },
  { value: "file", label: "File upload", hint: "Collect files — soon", disabled: true }
];

function QuestionTypeDropdown({ value, onChange }: { value: FormQuestion["type"]; onChange: (type: FormQuestion["type"]) => void }) {
  const [open, setOpen] = useState(false);
  const active = questionTypeOptions.find(option => option.value === value) ?? questionTypeOptions[0];
  return <div className={`question-type-menu ${open ? "open" : ""}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span className="question-type-label">Question type</span>
    <button className="question-type-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span><b>{active.label}</b><small>{active.hint}</small></span>
      <ChevronDown size={16}/>
    </button>
    {open && <div className="question-type-popover" role="listbox">
      {questionTypeOptions.map(option => <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={option.value === value}
        className={`${option.value === value ? "selected" : ""} ${option.disabled ? "disabled" : ""}`}
        disabled={option.disabled}
        onClick={() => {
          if (option.disabled) return;
          onChange(option.value as FormQuestion["type"]);
          setOpen(false);
        }}
      >
        <span><b>{option.label}</b><small>{option.hint}</small></span>
        {option.value === value && <Check size={15}/>}
      </button>)}
    </div>}
  </div>;
}


async function parseUploadedFile(file: File) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/research-docs/parse", { method: "POST", body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not extract this file");
  return String(result.text ?? "");
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error instanceof Event) return "The browser could not complete that action. Try the upload again or choose a different file.";
  return "Something went wrong. Try again.";
}

function InterviewsStage({ study, onAdd, onAnalyse, onDropFiles, onRemove }: { study: Study; onAdd: () => void; onAnalyse: () => void; onDropFiles: (files: FileList) => void; onRemove: (id: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const stale = study.status === "stale" && study.themes.length > 0;

  return <section className="interviews-stage page-pad"><div className="intake-layout"><div>
    <span className="eyebrow">STEP 1 · ADD INTERVIEWS</span>
    <h1>Add the conversations you want to learn from.</h1>
    <p className="lead">Upload or paste interviews. Glean will look for repeated problems and preserve the exact words behind every finding.</p>

    {stale && <div className="stale-banner" role="status">
      <Sparkles size={16}/>
      <span><b>These findings are out of date.</b><small>Interviews changed after the last analysis. Re-run it so the findings cover every transcript.</small></span>
      <button className="outline-button" onClick={onAnalyse}>Re-run analysis</button>
    </div>}

    <button
      className={`drop-zone ${dragging ? "dragging" : ""}`}
      onClick={onAdd}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragEnter={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files?.length) onDropFiles(event.dataTransfer.files);
      }}
    >
      <Upload size={24}/>
      <b>{dragging ? "Drop to add these interviews" : "Drop files here or click to upload"}</b>
      <small>PDF, DOCX, TXT, or paste transcript text</small>
    </button>

    <div className="interview-heading">
      <h2>{study.interviews.length} {study.interviews.length === 1 ? "interview" : "interviews"} added</h2>
      <button className="text-button" onClick={onAdd}><Plus size={16}/>Add another</button>
    </div>

    {study.interviews.length ? <div className="interview-list">{study.interviews.map(interview =>
      <div className="interview-row" key={interview.id}>
        <span className="participant-code">{interview.participant.code}</span>
        <span><b>{interview.participant.role}</b><small>{interview.participant.segment}</small></span>
        <span className={`quality ${interview.status}`}>
          {interview.status === "ready" ? <><Check size={15}/>Transcript ready</> : <><CircleHelp size={15}/>Needs review</>}
        </span>
        <span>{interview.wordCount.toLocaleString()} words</span>
        <button className="danger-icon" aria-label={`Remove ${interview.participant.code} from this study`} onClick={() => onRemove(interview.id)}>
          <Trash2 size={16}/>
        </button>
      </div>)}</div> : <div className="empty-interviews">
        <MessageSquareText size={28}/><h3>No interviews yet</h3><p>Add the first transcript to begin your study.</p>
      </div>}

    <div className="intake-actions">
      <span>5–20 interviews works best for reliable findings.</span>
      <button className="primary-button" disabled={!study.interviews.length} onClick={onAnalyse}>
        <Sparkles size={17}/>Analyse {study.interviews.length} {study.interviews.length === 1 ? "interview" : "interviews"}
      </button>
    </div>
  </div><aside className="what-next">
    <h2>What happens next</h2>
    <NextItem icon={<Search size={19}/>} title="Find repeated problems" text="Glean scans across interviews to surface what comes up most often."/>
    <NextItem icon={<Quote size={19}/>} title="Link to exact quotes" text="Every finding stays connected to what participants actually said."/>
    <NextItem icon={<FileText size={19}/>} title="Draft your report" text="Approved findings become a clear report you can edit and export."/>
    <div className="privacy"><LockKeyhole size={18}/><span><b>Your data stays private</b><small>Only you can access raw interviews in this prototype.</small></span></div>
  </aside></div></section>;
}


function NextItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="next-item"><span>{icon}</span><div><b>{title}</b><p>{text}</p></div></div>; }

const STRENGTH_LABEL: Record<Theme["strength"], string> = {
  emerging: "Emerging — seen once, treat as a lead",
  recurring: "Recurring — repeated across participants",
  dominant: "Dominant — the majority raised this"
};

function FindingsStage({ study, theme, index, onPrevious, onNext, onEvidence, onStatus, onAdd, onAnalyse }: { study: Study; theme: Theme | null; index: number; onPrevious: () => void; onNext: () => void; onEvidence: (evidence: Evidence) => void; onStatus: (id: string, status: ThemeStatus) => void; onAdd: () => void; onAnalyse: () => void }) {
  if (!study.interviews.length) return <EmptyStage eyebrow="STEP 1 · ADD INTERVIEWS" title="Add interviews before looking for patterns." text="Glean needs participant conversations before it can draft findings." action="Add first interview" onAction={onAdd}/>;
  if (!theme) return <EmptyStage eyebrow="STEP 2 · REVIEW FINDINGS" title="Your interviews are ready to analyse." text="Run analysis to surface early patterns linked to exact transcript quotes." action={`Analyse ${study.interviews.length} interviews`} onAction={onAnalyse}/>;

  // Coverage is counted from the interviews this finding actually quotes, not
  // from a stored integer nothing verifies.
  const supporting = new Set(theme.evidence.map(item => item.interviewId));
  const covered = supporting.size;
  const total = study.interviews.length;
  const percent = total ? Math.round((covered / total) * 100) : 0;

  return <section className="finding-stage page-pad">
    <div className="finding-nav">
      <button disabled={index === 0} onClick={onPrevious}><ArrowLeft size={16}/><span>Previous finding</span></button>
      <span>Finding {index + 1} of {study.themes.length}</span>
      <button disabled={index === study.themes.length - 1} onClick={onNext}><span>Next finding</span><ArrowRight size={16}/></button>
    </div>

    <div className="finding-heading">
      <div>
        <span className="eyebrow">FINDING</span>
        <h1>{theme.title}</h1>
        <p>{theme.summary}</p>
        <div className="finding-meta">
          <span className={`strength-chip ${theme.strength}`}>{STRENGTH_LABEL[theme.strength]}</span>
          {theme.status === "approved" && <span className="state-chip approved"><Check size={13}/>Approved</span>}
          {theme.status === "rejected" && <span className="state-chip rejected"><X size={13}/>Rejected</span>}
        </div>
      </div>
      <div className="coverage-block">
        <span className="eyebrow">PARTICIPANT COVERAGE</span>
        <div><b>{covered}</b><span>of {total} {total === 1 ? "participant" : "participants"} quoted<small>{percent}%</small></span></div>
        <div className="avatar-row">
          {study.interviews.slice(0, 6).map(interview =>
            <span key={interview.id} className={supporting.has(interview.id) ? "included" : ""} title={`${interview.participant.code} · ${interview.participant.role}`}>
              {interview.participant.code.replace(/^P/, "")}
            </span>)}
        </div>
      </div>
    </div>

    <section className="evidence-list">
      <span className="eyebrow">{theme.evidence.length === 1 ? "EXACT QUOTE" : `EXACT QUOTES · ${theme.evidence.length}`}</span>
      {theme.evidence.map(item => <QuoteBlock key={item.id} evidence={item} onOpen={() => onEvidence(item)}/>)}
    </section>

    <div className="finding-actions">
      {theme.status === "approved" && <button className="approved-button" onClick={() => onStatus(theme.id, "draft")}><Check size={17}/>Approved · Move back to review</button>}
      {theme.status === "rejected" && <button className="outline-button" onClick={() => onStatus(theme.id, "draft")}><ArrowLeft size={17}/>Rejected · Restore to review</button>}
      {theme.status === "draft" && <>
        <button className="text-button reject" onClick={() => onStatus(theme.id, "rejected")}><X size={17}/>Reject</button>
        <button className="primary-button" onClick={() => onStatus(theme.id, "approved")}><Check size={17}/>Approve finding</button>
      </>}
    </div>
  </section>;
}

/** The verbatim quote — one component so it reads the same everywhere. */
function QuoteBlock({ evidence, onOpen }: { evidence: Evidence; onOpen: () => void }) {
  return <figure className="exact-quote">
    <Quote size={22} aria-hidden="true"/>
    <blockquote>{evidence.quote}</blockquote>
    <figcaption>
      <span><b>{evidence.participantCode}</b> · {evidence.participantRole} · {evidence.segmentId}</span>
      <button className="text-button" onClick={onOpen}><Eye size={16}/>View transcript context</button>
    </figcaption>
  </figure>;
}



function EmptyStage({ eyebrow, title, text, action, onAction }: { eyebrow: string; title: string; text: string; action: string; onAction: () => void }) { return <section className="empty-stage"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p><button className="primary-button" onClick={onAction}>{action}<ArrowRight size={17}/></button></section>; }

function ReportStage({ study, onReview, onExport, exportOpen, onPdf, onWord, onCsv }: { study: Study; onReview: () => void; onExport: () => void; exportOpen: boolean; onPdf: () => void; onWord: () => void; onCsv: () => void }) {
  const approved = study.themes.filter(theme => theme.status === "approved");
  const exportRef = useRef<HTMLDivElement>(null);
  const [reportDate, setReportDate] = useState("");

  // Rendered on the client so the report is dated when it is opened rather
  // than at a literal date baked into the source.
  useEffect(() => setReportDate(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })), []);

  useEffect(() => {
    if (!exportOpen) return;
    const dismiss = (event: MouseEvent) => { if (!exportRef.current?.contains(event.target as Node)) onExport(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onExport(); };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", onKey); };
  }, [exportOpen, onExport]);

  const jump = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <section className="report-stage">
    <nav className="report-outline" aria-label="Report outline">
      <span className="eyebrow">REPORT OUTLINE</span>
      <a href="#report-summary" onClick={jump("report-summary")}>Executive summary</a>
      {approved.length > 0 && <>
        <span className="outline-group">Findings</span>
        {approved.map((theme, index) =>
          <a key={theme.id} href={`#finding-${theme.id}`} onClick={jump(`finding-${theme.id}`)}>{index + 1}. {theme.title}</a>)}
      </>}
      <a href="#report-limitations" onClick={jump("report-limitations")}>Limitations</a>
    </nav>

    <article className="report-document">
      <div className="report-document-head">
        <div>
          <span className="eyebrow">RESEARCH REPORT{reportDate && ` · ${reportDate.toUpperCase()}`}</span>
          <h1>{study.title}</h1>
          <p>{study.goal}</p>
        </div>
        <div className="report-actions">
          <div className="export-wrap" ref={exportRef}>
            <button className="outline-button" onClick={onExport} aria-haspopup="menu" aria-expanded={exportOpen}>
              <Download size={17}/>Export<ChevronDown size={15}/>
            </button>
            {exportOpen && <div className="export-menu" role="menu">
              <button role="menuitem" onClick={onPdf}><FileText size={16}/>Print / Save PDF</button>
              <button role="menuitem" onClick={onWord}><FileText size={16}/>Download Word report</button>
              <button role="menuitem" onClick={onCsv}><BarChart3 size={16}/>Download evidence CSV</button>
            </div>}
          </div>
        </div>
      </div>

      <section id="report-summary"><h2>Executive summary</h2><p>{executiveSummary(study)}</p></section>

      {approved.length ? approved.map((theme, index) => {
        const covered = new Set(theme.evidence.map(item => item.interviewId)).size;
        return <section className="report-finding" id={`finding-${theme.id}`} key={theme.id}>
          <span className="finding-number">Finding {index + 1}</span>
          <h2>{theme.title}</h2>
          <p>{theme.summary}</p>
          <div className="report-coverage">
            Quoted by {covered} of {study.interviews.length} {study.interviews.length === 1 ? "participant" : "participants"}
            <span className={`strength-chip ${theme.strength}`}>{theme.strength[0].toUpperCase() + theme.strength.slice(1)}</span>
          </div>
          {theme.evidence.map(item => <blockquote key={item.id}>
            &ldquo;{item.quote}&rdquo;<small>{item.participantCode} · {item.participantRole}</small>
          </blockquote>)}
        </section>;
      }) : <div className="report-empty">
        <FileText size={28}/>
        <h2>No approved findings yet</h2>
        <p>Review and approve at least one finding before presenting the report.</p>
        <button className="primary-button" onClick={onReview}>Review findings</button>
      </div>}

      <section id="report-limitations"><h2>Limitations</h2><p>
        {study.interviews.length
          ? `This study includes ${study.interviews.length} ${study.interviews.length === 1 ? "interview" : "interviews"}. Findings should be validated against additional user segments and relevant product behaviour data.`
          : "This report has no interviews attached. Re-add the source transcripts before relying on these findings."}
      </p></section>
    </article>
  </section>;
}


function EvidenceDrawer({ evidence, study, onClose }: { evidence: Evidence; study: Study; onClose: () => void }) {
  const interview = study.interviews.find(item => item.id === evidence.interviewId);
  const transcript = interview?.transcript ?? "";
  const paragraphs = transcript.split("\n\n");

  // Normalised comparison, shared with the export/validation path, instead of
  // a 22-character prefix substring that broke on a smart quote.
  const normalise = (value: string) => value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  const needle = normalise(evidence.quote);
  const matchIndex = paragraphs.findIndex(paragraph => normalise(paragraph).includes(needle));
  const verbatim = matchIndex > -1;
  const highlightRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return <Dialog
    variant="panel"
    className="evidence-drawer"
    eyebrow="SOURCE QUOTE"
    title={`${evidence.participantCode} · ${evidence.participantRole}`}
    closeLabel="Close transcript context"
    onClose={onClose}
  >
    <blockquote>&ldquo;{evidence.quote}&rdquo;</blockquote>
    <div className="source-meta">
      <span>{interview?.title}</span>
      <span>{interview?.date}</span>
      <span>{evidence.segmentId}</span>
    </div>
    {!verbatim && <p className="evidence-warning" role="status">
      This quote could not be matched to the stored transcript. Do not approve this finding until the wording is verified.
    </p>}
    <section>
      <h3>Transcript context</h3>
      <div className="transcript">
        {paragraphs.map((paragraph, index) =>
          <p key={index} ref={index === matchIndex ? highlightRef : undefined} className={index === matchIndex ? "highlight" : ""}>
            {paragraph}
          </p>)}
      </div>
    </section>
    <section>
      <h3>Why this supports the finding</h3>
      <p>{evidence.context}</p>
    </section>
  </Dialog>;
}


type ExtractedInterview = {
  id: string;
  code: string;
  role: string;
  segment: string;
  title: string;
  source: Interview["source"];
  transcript: string;
  wordCount: number;
  warning?: string;
};

function AddInterviewModal({ study, onClose, onAddMany, initialFiles }: { study: Study; onClose: () => void; onAddMany: (interviews: Interview[]) => void; initialFiles?: FileList | null }) {
  const [items, setItems] = useState<ExtractedInterview[]>([]);
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [extracting, setExtracting] = useState("");
  const nextCode = (offset: number) => `P${String(study.interviews.length + offset + 1).padStart(2, "0")}`;
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current || !initialFiles?.length) return;
    consumed.current = true;
    extractFiles(initialFiles).catch(error => setExtracting(readableError(error)));
  }, [initialFiles]);

  const buildItem = (index: number, title: string, source: Interview["source"], transcript: string): ExtractedInterview => {
    const cleanTitle = title.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    const role = inferRole(`${cleanTitle}\n${transcript}`);
    const participantCode = inferParticipantCode(transcript) ?? nextCode(index);
    const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
    return {
      id: `extracted-${Date.now()}-${index}`,
      code: participantCode,
      role,
      segment: "New participant",
      title: cleanTitle ? `Interview · ${cleanTitle}` : `Interview · ${participantCode}`,
      source,
      transcript: transcript.trim() || `Transcript extracted from ${title}. Replace this placeholder with the parsed text before analysis.`,
      wordCount: Math.max(wordCount, 1),
      warning: transcript.trim().length < 40 ? "Needs transcript text before strong analysis" : undefined
    };
  };

  const extractFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setExtracting(`Extracting ${files.length} ${files.length === 1 ? "file" : "files"}…`);
    const extracted = await Promise.all(Array.from(files).map(async (file, index) => {
      const source = sourceFromFile(file.name);
      try {
        const text = source === "txt" ? await file.text() : await parseUploadedFile(file);
        return buildItem(items.length + index, file.name, source, text);
      } catch (error) {
        const item = buildItem(items.length + index, file.name, source, "");
        return { ...item, warning: error instanceof Error ? error.message : "Could not extract this file" };
      }
    }));
    setItems(current => [...current, ...extracted]);
    setExtracting("");
  };

  const extractPaste = () => {
    const chunks = paste.split(/\n-{3,}\n|(?:\n\n(?=P\d{2}\s*:|Participant\s+\d+\s*:))/i).map(chunk => chunk.trim()).filter(Boolean);
    const extracted = chunks.map((chunk, index) => buildItem(items.length + index, `Pasted transcript ${items.length + index + 1}`, "paste", chunk));
    setItems(current => [...current, ...extracted]);
    setPaste("");
    setMode("upload");
  };

  const updateItem = (id: string, patch: Partial<ExtractedInterview>) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const removeItem = (id: string) => setItems(current => current.filter(item => item.id !== id));

  const submit = () => {
    const now = Date.now();
    onAddMany(items.map((item, index) => ({
      id: `interview-${now}-${index}`,
      participant: { id: `participant-${now}-${index}`, code: item.code, role: item.role.trim() || "Participant", segment: item.segment.trim() || "New participant", accent: ["mint", "coral", "violet", "blue", "amber"][index % 5] },
      title: item.title,
      date: "Jul 31",
      source: item.source,
      wordCount: item.transcript.trim().split(/\s+/).length,
      status: item.warning ? "needs-review" : "ready",
      transcript: item.transcript.trim(),
      summary: item.warning ? "Imported, but transcript quality needs review." : "Extracted and ready for analysis."
    })));
  };

  const readyCount = items.filter(item => item.transcript.trim().length >= 40).length;

  return <Dialog className="intake-modal" eyebrow="UPLOAD INTERVIEWS" title="Extract participants from files."
    closeLabel="Close add interview" onClose={onClose} footer={<>
      <button className="text-button" onClick={onClose}>Cancel</button>
      <button className="primary-button" disabled={!items.length} onClick={submit}>Add {items.length || ""} {items.length === 1 ? "interview" : "interviews"}</button>
    </>}>
  <div className="modal-body">
    <div className="intake-tabs"><button className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}><Upload size={15}/>Upload files</button><button className={mode === "paste" ? "active" : ""} onClick={() => setMode("paste")}><ClipboardList size={15}/>Paste batch</button></div>
    {mode === "upload" ? <label className="file-picker"><Upload size={22}/><b>{extracting ? "Extracting files…" : "Select transcripts"}</b><small>Choose multiple TXT, DOCX, or PDF files. Glean extracts text, creates participant rows, and flags files that need review.</small><input type="file" multiple accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { const files = event.currentTarget.files; extractFiles(files).catch(error => setExtracting(readableError(error))); event.currentTarget.value = ""; }}/></label> : <div className="paste-batch"><label>Paste one or many transcripts<textarea rows={8} value={paste} onChange={event => setPaste(event.target.value)} placeholder={"Interviewer: Tell me what you expected…\nParticipant: I wanted to…\n\n---\n\nInterviewer: What felt unclear?\nParticipant: The setup felt long."}/></label><button className="outline-button" disabled={paste.trim().length < 40} onClick={extractPaste}>Extract pasted interviews</button></div>}
    {extracting && <div className="import-status loading"><Sparkles size={15}/><span>{extracting}</span></div>}
    <section className="extracted-panel">
      <div className="extracted-head"><div><span className="eyebrow">REVIEW BEFORE IMPORT</span><h3>{items.length ? `${items.length} extracted ${items.length === 1 ? "interview" : "interviews"}` : "No interviews extracted yet"}</h3></div><span>{readyCount} ready</span></div>
      {items.length ? <div className="extracted-list">{items.map(item => <article className="extracted-row" key={item.id}>
        <div className="extracted-code"><input value={item.code} onChange={event => updateItem(item.id, { code: event.target.value })}/></div>
        <label>Participant role<input value={item.role} onChange={event => updateItem(item.id, { role: event.target.value })} placeholder="e.g. Product designer"/></label>
        <label>Segment<input value={item.segment} onChange={event => updateItem(item.id, { segment: event.target.value })}/></label>
        <div className="extracted-meta"><span>{item.source.toUpperCase()}</span><span>{item.wordCount.toLocaleString()} words</span>{item.warning && <em>{item.warning}</em>}</div>
        <button aria-label={`Remove ${item.code}`} onClick={() => removeItem(item.id)}><X size={16}/></button>
      </article>)}</div> : <div className="empty-extract"><FileText size={24}/><p>Upload several interview files and Glean will create editable participant rows before importing them into the study.</p></div>}
    </section>
    <div className="privacy-note"><LockKeyhole size={17}/><span><b>Private by default</b><small>Raw transcripts stay visible only to you. AI should analyse the redacted copy in production.</small></span></div>
  </div></Dialog>;
}

function sourceFromFile(name: string): Interview["source"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt")) return "txt";
  return "txt";
}

function inferParticipantCode(text: string) {
  return text.match(/\bP\d{2}\b/i)?.[0]?.toUpperCase();
}

function inferRole(text: string) {
  const explicit = text.match(/(?:role|participant role)\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit) return explicit;
  const fromFile = text.match(/\b(product designer|designer|founder|researcher|manager|student|customer|consultant|founder|owner|developer)\b/i)?.[0];
  return fromFile ? titleCase(fromFile) : "Participant";
}



function ChatModal({ study, onClose, onReview }: { study: Study; onClose: () => void; onReview: () => void }) {
  const approved = study.themes.filter(theme => theme.status === "approved");
  const finding = approved[0] ?? study.themes[0];
  const quote = finding?.evidence[0];
  return <Dialog className="chat-modal" eyebrow="STUDY CHAT" title="Ask Glean" onClose={onClose} footer={
    <label className="chat-input"><input placeholder="Chat is not available yet" disabled/><button className="primary-button" disabled><SendHorizontal size={16}/>Send</button></label>
  }>
    <div className="chat-body">
      <div className="chat-message user">What should we change in onboarding?</div>
      <div className="chat-message assistant">
        <b>Example answer</b>
        <p>{finding
          ? "Chat cannot answer from your study yet. When it can, every answer will cite the exact quotes it drew on, and refuse to answer where the interviews do not support a conclusion."
          : "There is not enough interview evidence yet. Add interviews and review findings before Glean can answer from the study."}</p>
        {quote && <button className="citation-chip" onClick={onReview}><Quote size={14}/>{quote.participantCode} · {quote.segmentId}</button>}
      </div>
      <div className="chat-limits"><LockKeyhole size={16}/><span><b>This is a preview of the intended interaction.</b><small>Nothing here is generated from your study. Production chat still needs retrieval, citations, refusal behaviour, and answer validation.</small></span></div>
    </div>
  </Dialog>;
}

function SettingsModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [autoRedact, setAutoRedact] = useState(true);
  const [quoteMode, setQuoteMode] = useState(true);
  return <Dialog variant="panel" className="settings-panel" eyebrow="WORKSPACE SETTINGS" title="Settings" onClose={onClose} footer={<>
    <button className="text-button" onClick={onClose}>Cancel</button>
    <button className="primary-button" onClick={onSave}>Save settings</button>
  </>}>
    <section>
      <h3>Analysis</h3>
      <label className="switch-row"><span><b>Redact personal details</b><small>Use a private analysis copy by default.</small></span><input type="checkbox" checked={autoRedact} onChange={event => setAutoRedact(event.target.checked)}/></label>
      <label className="switch-row"><span><b>Require exact quotes</b><small>Hide findings that are not linked to a transcript passage.</small></span><input type="checkbox" checked={quoteMode} onChange={event => setQuoteMode(event.target.checked)}/></label>
    </section>
    <section>
      <h3>Workspace</h3>
      <div className="settings-account"><span>MA</span><div><b>Matilda Anashie</b><small>Solo researcher workspace</small></div></div>
    </section>
  </Dialog>;
}

function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }: { title: string; body: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <Dialog className="confirm-modal" title={title} onClose={onCancel} footer={<>
    <button className="text-button" onClick={onCancel}>Cancel</button>
    <button className="danger-button" onClick={onConfirm}>{confirmLabel}</button>
  </>}>
    <div className="modal-body"><p className="modal-copy">{body}</p></div>
  </Dialog>;
}

function Welcome({ onExplore, onCreate }: { onExplore: () => void; onCreate: () => void }) {
  return <div className="welcome"><header><div className="welcome-brand"><Sprout size={27}/><span><b>Glean</b><small>Powered by Folde</small></span></div></header><main><span className="eyebrow">WELCOME TO GLEAN</span><h1>From interviews to a report you can stand behind.</h1><p>Add conversations, verify the findings against exact quotes, then export a clear research report.</p><div className="welcome-steps"><JourneyLine number="1" title="Add interviews" text="Paste or upload 5–20 conversations." complete={false}/><JourneyLine number="2" title="Review findings" text="Approve only what the source supports." complete={false}/><JourneyLine number="3" title="Present report" text="Export a stakeholder-ready synthesis." complete={false}/></div><div className="welcome-actions"><button className="primary-button" onClick={onExplore}>Explore a sample study<ArrowRight size={17}/></button><button className="text-button" onClick={onCreate}>Create a blank study</button></div></main></div>;
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
