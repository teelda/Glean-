"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, ChevronUp, Bot, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardList, Download, Eye, FileText, FolderOpen, Home, Lightbulb,
  LockKeyhole, LogOut, Menu, MessageSquareText, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, Plus, Quote,
  Save, Search, SendHorizontal, Settings, Share2, Sparkles, Sprout, Trash2, Upload, X
} from "lucide-react";
import { sampleStudy } from "@/lib/sample-data";
import type { Evidence, Interview, Strength, Study, Theme, ThemeStatus } from "@/lib/types";
import type { FormDraft, FormLogic, FormQuestion, FormSection } from "@/lib/form-import";
import { Dialog } from "./components/Dialog";
import { buildEvidenceCsv, buildWordReport, executiveSummary } from "@/lib/export";
import { createSupabaseBrowserClient, authConfigured } from "@/lib/supabase/client";
import { FormTeam } from "./components/FormTeam";
import { StudyLibrary } from "./components/StudyLibrary";

type SessionUser = { id: string; email: string | null };

/** Where the workspace study lived before accounts existed. */
const LEGACY_STUDY_KEY = "glean-study-v1";

/** The form builder's autosave slot. Home reads it to know whether to offer
 *  "Create a form" or "Complete your form". */
const FORM_DRAFT_KEY = "glean-form-draft-v1";

type FormDraftSummary = { name: string; questions: number };

/**
 * A draft form exists only once it has questions — an empty shell saved by the
 * builder is not something a person can meaningfully "complete", and offering
 * to resume it would send them to a blank page.
 */
function readFormDraftSummary(userId?: string): FormDraftSummary | null {
  try {
    const raw = window.localStorage.getItem(userId ? `${FORM_DRAFT_KEY}:${userId}` : FORM_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as { formName?: string; sections?: FormSection[] };
    const questions = (draft.sections ?? []).reduce((total, section) => total + (section.questions?.length ?? 0), 0);
    if (!questions) return null;
    return { name: draft.formName?.trim() || "Untitled research form", questions };
  } catch {
    return null;
  }
}

/** Two letters from the email's local part, so the avatar is not a blank disc. */
function initialsFor(email: string | null) {
  const local = (email ?? "").split("@")[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return (letters || "?").toUpperCase();
}
import {
  buildContextFormDraft, encodeFormDraftForUrl, isLegacyContextValue,
  removeContextEchoQuestions, segmentResearchDoc, slugify, splitDraftByPurpose, titleCase
} from "@/lib/form-import";

type Area = "home" | "studies" | "forms" | "study" | "help" | "settings";
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
  const [showExport, setShowExport] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  // null = follow the area default (the builder wants the room, so Forms
  // collapses the rail to icons); true/false = the person overrode it.
  const [navOverride, setNavOverride] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [formDraft, setFormDraft] = useState<FormDraftSummary | null>(null);

  useEffect(() => setPrefs(readPreferences()), []);

  // Re-read on every area change: the builder autosaves as you leave it, so
  // coming back to Home should already know there is a form to finish.

  const updatePrefs = useCallback((patch: Partial<Preferences>, message: string) => {
    setPrefs(current => {
      const next = { ...current, ...patch };
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      return next;
    });
    notify(message);
  }, []);
  const [toast, setToast] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<FileList | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const cloudRevision = useRef<{ studyId: string; revision: number | null } | null>(null);
  const savingStudy = useRef(false);
  const pendingStudy = useRef<Study | null>(null);
  const loadedAccount = useRef<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // One key for the workspace study, derived from who is signed in. Before
  // accounts existed everything lived under LEGACY_STUDY_KEY; scoping it per
  // user stops two accounts on the same machine from seeing each other's study.
  const storageKey = user ? `${LEGACY_STUDY_KEY}:${user.id}` : LEGACY_STUDY_KEY;
  useEffect(() => setFormDraft(readFormDraftSummary(user?.id)), [area, user?.id]);

  // The middleware already guarantees a session on this route; this only reads
  // it so the shell can show who is signed in and offer sign-out.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ? { id: data.user.id, email: data.user.email ?? null } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
      if (event === "SIGNED_OUT") window.location.replace("/signin?error=session-ended");
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    setShowWelcome(!window.localStorage.getItem("glean-onboarded"));
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "forms") return setArea("forms");
      if (hash === "help") return setArea("help");
      if (hash === "settings") return setArea("settings");
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

  // Load the study for whoever is signed in. Runs again when the account
  // changes, so signing out and back in as someone else swaps the workspace
  // instead of leaving the previous person's study on screen.
  useEffect(() => {
    setLoaded(false);
    setCloudReady(false); loadedAccount.current = null; pendingStudy.current = null;
    const controller = new AbortController();
    if (!user && authConfigured()) return () => controller.abort();
    let raw = window.localStorage.getItem(storageKey);

    // First sign-in on a browser that already held pre-auth work: adopt it once,
    // for one account only. `glean-study-claimed` records which, so a second
    // account on the same machine starts clean rather than inheriting it.
    if (!raw && user) {
      const legacy = window.localStorage.getItem(LEGACY_STUDY_KEY);
      const claimedBy = window.localStorage.getItem("glean-study-claimed");
      if (legacy && (!claimedBy || claimedBy === user.id)) {
        window.localStorage.setItem(storageKey, legacy);
        window.localStorage.setItem("glean-study-claimed", user.id);
        raw = legacy;
      }
    }

    let localStudy = user ? emptyStudy() : initialStudy;
    if (raw) {
      try { localStudy = JSON.parse(raw); } catch { localStudy = initialStudy; }
    }

    if (!user) {
      setStudy(localStudy);
      setLoaded(true);
      return () => controller.abort();
    }

    fetch("/api/studies/current", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load saved study");
        return response.json();
      })
      .then(result => {
        if (controller.signal.aborted) return;
        const next = result.study ?? localStudy;
        cloudRevision.current = { studyId: next.id, revision: result.revision };
        loadedAccount.current = user.id;
        setStudy(next); setCloudReady(true);
      })
      .catch(error => {
        if ((error as Error).name !== "AbortError") { loadedAccount.current = user.id; setStudy(localStudy); notify("Cloud study could not load. Cloud saving is paused; reload to retry."); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [storageKey, user?.id]);

  useEffect(() => {
    // Wait for the stored study to land first: writing on the mount pass would
    // persist the initial demo study over it, before the hydrating setState
    // commits. Once `loaded` flips, this re-runs with the real value.
    if (!loaded || (user && loadedAccount.current !== user.id)) return;
    window.localStorage.setItem(storageKey, JSON.stringify(study));
    if (!user || !cloudReady) return;
    pendingStudy.current = study;
    const timer = window.setTimeout(() => {
      if (savingStudy.current) return;
      savingStudy.current = true;
      (async () => {
        try {
          while (pendingStudy.current && loadedAccount.current === user.id) {
            const next = pendingStudy.current; pendingStudy.current = null;
            const revision = cloudRevision.current?.studyId === next.id ? cloudRevision.current.revision : null;
            const response = await fetch("/api/studies/current", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ study: next, revision }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "Cloud save failed");
            cloudRevision.current = { studyId: next.id, revision: result.revision };
          }
        } catch (error) { setCloudReady(false); notify(error instanceof Error ? error.message : "Cloud sync paused. Reload to retry."); }
        finally { savingStudy.current = false; }
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [study, loaded, storageKey, user, cloudReady]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const approved = study.themes.filter(theme => theme.status === "approved").length;
  const reviewed = study.themes.filter(theme => theme.status !== "draft").length;
  const readiness = study.themes.length ? Math.round((reviewed / study.themes.length) * 100) : 0;
  const safeIndex = Math.min(findingIndex, Math.max(study.themes.length - 1, 0));
  const selectedTheme = study.themes[safeIndex] ?? null;

  // Sign-out clears the Supabase session cookie. A browser copy remains for
  // offline recovery, while the primary study is synchronised to Supabase.
  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/signin";
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  const openArea = (nextArea: Area) => {
    setArea(nextArea);
    setMobileNav(false);
    setNavOverride(null);
    if (window.location.hash !== `#${nextArea}`) window.history.pushState(null, "", `#${nextArea}`);
  };

  const openStudy = (nextStage: Stage = "findings") => {
    setArea("study");
    setStage(nextStage);
    setMobileNav(false);
    setNavOverride(null);
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
    if (user && (!cloudReady || savingStudy.current || pendingStudy.current)) { notify("Wait for cloud saving to finish before starting another study."); return; }
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
        title: "Source excerpt awaiting interpretation",
        summary: "This is a transcript excerpt for researcher review. No cross-interview analysis has been performed.",
        strength: "emerging",
        participantCount: 1,
        status: "draft",
        tags: ["Source excerpt"],
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
    notify("Source excerpt prepared. Automated synthesis is not connected.");
  };

  // Renaming lived nowhere: a study created from Home was called "Untitled
  // research study" for the rest of its life, including in the exported report.
  const updateStudyDetails = (patch: Partial<Study>) => {
    setStudy(current => ({ ...current, ...patch, updatedAt: "just now" }));
  };

  // A downloadable backup is still useful for recovery and portability even
  // though signed-in workspaces now synchronise to Supabase.
  const exportWorkspace = () => {
    downloadFile(
      `glean-workspace-${slugify(study.title || "study")}.json`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), study }, null, 2),
      "application/json"
    );
    notify("Workspace backup downloaded");
  };

  const importWorkspace = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { study?: Study } | Study;
      const next = (parsed as { study?: Study }).study ?? (parsed as Study);
      if (!next || !Array.isArray(next.interviews) || !Array.isArray(next.themes)) {
        throw new Error("not a Glean workspace file");
      }
      setStudy({ ...next, updatedAt: "just now" });
      setFindingIndex(0);
      notify("Workspace restored");
    } catch {
      notify("That file is not a Glean workspace backup");
    }
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

  const navCollapsed = navOverride ?? (prefs.autoCollapseNav && area === "forms");
  if (authConfigured() && !loaded) return <main className="signin-view"><section className="signin-card"><h1>Opening your workspace…</h1><p>Loading your saved research.</p></section></main>;

  return <div className={`glean-app ${navCollapsed ? "nav-collapsed" : ""}`}>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>} 
    <Sidebar study={study} area={area} stage={stage} reviewed={reviewed} onArea={openArea} onStage={openStudy} mobileOpen={mobileNav} user={user} onSignOut={signOut} collapsed={navCollapsed} onToggleCollapse={() => setNavOverride(!navCollapsed)}/>

    <main className="glean-main">
      <Topbar
        area={area}
        study={study}
        readiness={readiness}
        stage={stage}
        user={user}
        onMenu={() => setMobileNav(true)}
        onArea={openArea}
        onStage={openStudy}
        onChat={() => setShowChat(true)}
        onNew={() => startNewStudy("interviews")}
        onSignOut={signOut}
        onOpenFinding={index => { setFindingIndex(index); openStudy("findings"); }}
      />

      {area === "home" && <HomeView study={study} approved={approved} readiness={readiness} hasWork={hasWork} formDraft={formDraft} onContinue={() => openStudy(study.interviews.length ? "findings" : "interviews")} onNew={() => startNewStudy("interviews")} onForms={() => openArea("forms")} onInterviews={() => openStudy("interviews")} onChat={() => setShowChat(true)}/>} 
      {area === "studies" && <StudiesView study={study} formDraft={formDraft} onOpen={() => openStudy(study.interviews.length ? "findings" : "interviews")} onNew={() => startNewStudy("interviews")} onForms={() => openArea("forms")}/>} 
      {area === "studies" && user && <StudyLibrary currentId={study.id} onSelect={(next, revision) => { if (savingStudy.current || pendingStudy.current) { notify("Wait for the current study to finish saving before switching."); return; } cloudRevision.current = { studyId: next.id, revision }; setStudy(next); setCloudReady(true); openStudy("interviews"); }}/>}
      {area === "forms" && <FormsView key={user?.id ?? "local"} userId={user?.id} study={study} onImportResponses={items => { setStudy(current => ({ ...current, interviews: [...current.interviews, ...items.filter(item => !current.interviews.some(i => i.id === item.id))], status: "stale" })); notify("Responses added as study sources"); }} onOpenStudy={() => openStudy("interviews")} onCopied={() => notify("Form link copied")}/>}
      {area === "study" && stage === "interviews" && <InterviewsStage study={study} onAdd={() => setShowAdd(true)} onAnalyse={analyse} onDropFiles={setDroppedFiles} onRemove={removeInterview}/>} 
      {area === "study" && stage === "findings" && <FindingsStage
        study={study}
        theme={selectedTheme}
        index={safeIndex}
        onSelect={setFindingIndex}
        onPrevious={() => setFindingIndex(index => Math.max(0, index - 1))}
        onNext={() => setFindingIndex(index => Math.min(study.themes.length - 1, index + 1))}
        onEvidence={setEvidence}
        onStatus={changeStatus}
        onAdd={() => setStage("interviews")}
        onAnalyse={analyse}
      />} 
      {area === "help" && <HelpView onForms={() => openArea("forms")} onInterviews={() => openStudy("interviews")} onSettings={() => openArea("settings")}/>}
      {area === "settings" && <SettingsView user={user} study={study} prefs={prefs} onUpdate={updatePrefs} onSignOut={signOut} onReset={() => startNewStudy("interviews")} onExportCsv={exportEvidence} onExportWord={exportWord} onStudyChange={updateStudyDetails} onExportWorkspace={exportWorkspace} onImportWorkspace={importWorkspace}/>}
      {area === "study" && stage === "report" && <ReportStage study={study} onReview={() => setStage("findings")} onExport={() => setShowExport(value => !value)} exportOpen={showExport} onPdf={() => { window.print(); setShowExport(false); }} onWord={exportWord} onCsv={exportEvidence}/>} 
    </main>

    {evidence && <EvidenceDrawer evidence={evidence} study={study} onClose={() => setEvidence(null)}/>} 
    {(showAdd || droppedFiles) && <AddInterviewModal study={study} initialFiles={droppedFiles} onClose={() => { setShowAdd(false); setDroppedFiles(null); }} onAddMany={addInterviews}/>} 
    {showChat && <ChatModal study={study} area={area} stage={stage} formDraft={formDraft} onClose={() => setShowChat(false)} onReview={() => { setShowChat(false); openStudy("findings"); }} onGo={destination => { setShowChat(false); if (destination === "forms") openArea("forms"); else openStudy(destination); }}/>} 
    {confirmReset && <ConfirmDialog
      title="Start a new study?"
      body={user ? "Your saved studies remain available in Studies. Wait for cloud saving to finish before starting another study." : "This replaces the current browser-only study. Download a backup first if you need to keep it."}
      confirmLabel="Start study"
      onCancel={() => setConfirmReset(false)}
      onConfirm={() => commitNewStudy(pendingArea)}
    />}
    {showWelcome && <Welcome onExplore={() => { window.localStorage.setItem("glean-onboarded", "true"); setShowWelcome(false); }} onCreate={() => { window.localStorage.setItem("glean-onboarded", "true"); setStudy(emptyStudy()); setShowWelcome(false); openStudy("interviews"); }}/>} 
    {toast && <div className="glean-toast" role="status"><Check size={16}/>{toast}</div>}
  </div>;
}

function Sidebar({ study, area, stage, reviewed, onArea, onStage, mobileOpen, user, onSignOut, collapsed, onToggleCollapse }: { study: Study; area: Area; stage: Stage; reviewed: number; onArea: (area: Area) => void; onStage: (stage: Stage) => void; mobileOpen: boolean; user: SessionUser | null; onSignOut: () => void; collapsed: boolean; onToggleCollapse: () => void }) {
  const steps: { id: Stage; label: string; meta: string }[] = [
    { id: "interviews", label: "Add interviews", meta: `${study.interviews.length} interviews` },
    { id: "findings", label: "Review findings", meta: `${study.themes.length} findings` },
    { id: "report", label: "Present report", meta: study.themes.some(theme => theme.status === "approved") ? "Ready to draft" : "Not started" }
  ];
  // Labels double as tooltips once the rail is icons-only, so the collapsed
  // state stays usable without hovering blind.
  return <aside className={`glean-sidebar ${mobileOpen ? "open" : ""}`}>
    <div className="sidebar-head">
      <a className="glean-brand" href="#home" onClick={() => onArea("home")} aria-label="Glean home"><span><Sprout size={26}/></span><span><b>Glean</b><small>Powered by Folde</small></span></a>
      <button
        type="button"
        className="nav-collapse-toggle"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        title={collapsed ? "Expand navigation" : "Collapse navigation"}
      >{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button>
    </div>
    <nav className="global-nav" aria-label="Primary navigation">
      <a className={area === "home" ? "active" : ""} href="#home" onClick={() => onArea("home")} title="Home"><Home size={20}/><span>Home</span></a>
      <a className={area === "studies" || (area === "study" && stage !== "report") ? "active" : ""} href="#studies" onClick={() => onArea("studies")} title="Studies"><FolderOpen size={20}/><span>Studies</span></a>
      <a className={area === "forms" ? "active" : ""} href="#forms" onClick={() => onArea("forms")} title="Forms"><ClipboardList size={20}/><span>Forms</span></a>
      <a className={area === "study" && stage === "report" ? "active" : ""} href="#report" onClick={() => onStage("report")} title="Reports"><FileText size={20}/><span>Reports</span></a>
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
      <button className={area === "help" ? "active" : ""} onClick={() => onArea("help")} title="Help"><CircleHelp size={20}/><span>Help</span></button>
      <button className={area === "settings" ? "active" : ""} onClick={() => onArea("settings")} title="Settings"><Settings size={20}/><span>Settings</span></button>
      {user
        ? <button className="profile" onClick={onSignOut} title={`Sign out of ${user.email ?? "Glean"}`}>
            <span>{initialsFor(user.email)}</span>
            <span><b>{user.email ?? "Signed in"}</b><small>Sign out</small></span>
            <LogOut size={15}/>
          </button>
        : <button className="profile" onClick={onSignOut}><span>—</span><span><b>Not signed in</b><small>Sign in</small></span><ChevronDown size={15}/></button>}
    </div>
  </aside>;
}

const STAGE_LABEL: Record<Stage, string> = { interviews: "Interviews", findings: "Findings", report: "Report" };

/**
 * The bar carried a single flat title and, on a study, a chevron that opened
 * nothing — an affordance the app could not honour. It is a breadcrumb now:
 * inside a study you are three levels deep, and the trail is the only thing
 * that says so and lets you climb back out.
 */
function Topbar({ area, study, readiness, stage, user, onMenu, onArea, onStage, onChat, onNew, onSignOut, onOpenFinding }: { area: Area; study: Study; readiness: number; stage: Stage; user: SessionUser | null; onMenu: () => void; onArea: (area: Area) => void; onStage: (stage: Stage) => void; onChat: () => void; onNew: () => void; onSignOut: () => void; onOpenFinding: (index: number) => void }) {
  const trail = area === "home" ? [{ label: "Home" }]
    : area === "studies" ? [{ label: "Studies" }]
    : area === "forms" ? [{ label: "Forms" }]
    : area === "help" ? [{ label: "Help" }]
    : area === "settings" ? [{ label: "Settings" }]
    : [{ label: "Studies", go: () => onArea("studies") }, { label: study.title, go: () => onStage(stage) }, { label: STAGE_LABEL[stage] }];

  // Inside a study the bar already carries readiness and "Open report", so the
  // create action drops its label rather than pushing the breadcrumb off-screen.
  return <header className={`glean-topbar ${area === "study" ? "in-study" : ""}`}>
    <div className="topbar-title">
      <button className="mobile-menu" aria-label="Open navigation" onClick={onMenu}><Menu size={20}/></button>
      <nav className="topbar-crumbs" aria-label="Breadcrumb">
        {trail.map((crumb, index) => <span key={crumb.label}>
          {index > 0 && <ChevronRight size={14} aria-hidden="true"/>}
          {crumb.go ? <button onClick={crumb.go}>{crumb.label}</button> : <b aria-current="page">{crumb.label}</b>}
        </span>)}
      </nav>
    </div>
    <div className="topbar-actions">
      {area === "study" && <>
        <div className="report-readiness"><span>Report readiness</span><i/><b>{readiness >= 75 ? "Good" : readiness ? "In progress" : "Not started"}</b><div><span style={{ width: `${readiness}%` }}/></div><em>{readiness}%</em></div>
        {stage !== "report" && <button className="outline-button" onClick={() => onStage("report")}><FileText size={17}/>Open report</button>}
      </>}
      <GlobalSearch study={study} onArea={onArea} onStage={onStage} onOpenFinding={onOpenFinding}/>
      <button className="topbar-chat" onClick={onChat} title="Ask Glean"><Bot size={17}/><span>Ask Glean</span></button>
      <button className="topbar-new primary-button" onClick={onNew} title="Start a new study"><Plus size={17}/><span>New study</span></button>
      <TopbarAccount user={user} onSignOut={onSignOut} onSettings={() => onArea("settings")} onHelp={() => onArea("help")}/>
    </div>
  </header>;
}

type SearchHit = { id: string; kind: string; label: string; meta: string; go: () => void };

/**
 * The bar could name where you were but never take you anywhere you had not
 * already navigated to. Findings are the thing people hunt for by phrase — a
 * quote half-remembered from a transcript — and the sidebar has no way to reach
 * one directly, so search resolves to a finding, an interview, or an area.
 */
function GlobalSearch({ study, onArea, onStage, onOpenFinding }: { study: Study; onArea: (area: Area) => void; onStage: (stage: Stage) => void; onOpenFinding: (index: number) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl-K is the shortcut people already try in tools shaped like this.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const term = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  if (term) {
    if (`${study.title} ${study.goal}`.toLowerCase().includes(term)) {
      hits.push({ id: "study", kind: "Study", label: study.title, meta: `${study.interviews.length} interviews · ${study.themes.length} findings`, go: () => onStage(study.interviews.length ? "findings" : "interviews") });
    }
    study.themes.forEach((theme, index) => {
      const haystack = `${theme.title} ${theme.summary} ${theme.tags.join(" ")} ${theme.evidence.map(item => item.quote).join(" ")}`.toLowerCase();
      if (haystack.includes(term)) {
        hits.push({ id: `theme-${theme.id}`, kind: "Finding", label: theme.title, meta: `${theme.strength} · ${theme.participantCount} participants`, go: () => onOpenFinding(index) });
      }
    });
    study.interviews.forEach(interview => {
      const haystack = `${interview.participant.code} ${interview.participant.role} ${interview.transcript}`.toLowerCase();
      if (haystack.includes(term)) {
        hits.push({ id: `interview-${interview.id}`, kind: "Interview", label: interview.participant.code, meta: interview.participant.role, go: () => onStage("interviews") });
      }
    });
    ([
      { label: "Forms", meta: "Build and publish a research form", go: () => onArea("forms") },
      { label: "Report", meta: "Approved findings, ready to export", go: () => onStage("report") },
      { label: "Settings", meta: "Workspace preferences and data", go: () => onArea("settings") },
      { label: "Help", meta: "How Glean works", go: () => onArea("help") }
    ]).forEach(place => {
      if (place.label.toLowerCase().includes(term) || place.meta.toLowerCase().includes(term)) {
        hits.push({ id: `area-${place.label}`, kind: "Go to", label: place.label, meta: place.meta, go: place.go });
      }
    });
  }
  const shown = hits.slice(0, 6);

  const choose = (hit: SearchHit) => {
    hit.go();
    setQuery("");
    setOpen(false);
  };

  return <div className={`topbar-search ${open ? "open" : ""}`} ref={boxRef}>
    <label className="search-field compact">
      <Search size={16}/>
      <input
        ref={inputRef}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={event => { if (event.key === "Enter" && shown[0]) choose(shown[0]); }}
        placeholder="Search findings, interviews…"
        aria-label="Search this workspace"
      />
      <kbd aria-hidden="true">⌘K</kbd>
    </label>
    {open && term.length > 0 && <div className="search-results" role="listbox">
      {shown.length === 0
        ? <p className="search-empty">Nothing in this workspace matches “{query.trim()}”.</p>
        : shown.map(hit => <button key={hit.id} type="button" role="option" aria-selected="false" onClick={() => choose(hit)}>
            <em>{hit.kind}</em>
            <span><b>{hit.label}</b><small>{hit.meta}</small></span>
            <ChevronRight size={15}/>
          </button>)}
    </div>}
  </div>;
}

/**
 * Who you are was only ever shown in the sidebar, which collapses to icons in
 * Forms — the screen people spend longest on. The bar carries it now, with the
 * two destinations the collapsed rail also hides.
 */
function TopbarAccount({ user, onSignOut, onSettings, onHelp }: { user: SessionUser | null; onSignOut: () => void; onSettings: () => void; onHelp: () => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return <div className="topbar-account" ref={boxRef}>
    <button
      type="button"
      onClick={() => setOpen(value => !value)}
      aria-haspopup="menu"
      aria-expanded={open}
      title={user?.email ?? "Account"}
    >{initialsFor(user?.email ?? null)}</button>
    {open && <div className="account-menu" role="menu">
      <div className="account-menu-head"><b>{user?.email ?? "Not signed in"}</b><small>{user ? "Solo researcher workspace" : "Sign in to keep your study"}</small></div>
      <button role="menuitem" onClick={() => { setOpen(false); onSettings(); }}><Settings size={15}/>Settings</button>
      <button role="menuitem" onClick={() => { setOpen(false); onHelp(); }}><CircleHelp size={15}/>Help</button>
      <button role="menuitem" onClick={onSignOut}><LogOut size={15}/>{user ? "Sign out" : "Sign in"}</button>
    </div>}
  </div>;
}

const RESEARCH_PATHS = [
  { id: "form", tone: "lilac", icon: ClipboardList, title: "Create a form", body: "Draft a screener, consent and questions from your research goal — or from a plan you already wrote.", go: "Start" },
  { id: "interviews", tone: "teal", icon: MessageSquareText, title: "Analyse interviews", body: "Upload transcripts and review themes that stay tied to the exact words participants used.", go: "Start" },
  { id: "doc", tone: "coral", icon: FileText, title: "Import a research doc", body: "Pull questions out of a DOCX, PDF or TXT and turn them into an editable form draft.", go: "Start" }
] as const;

function HomeView({ study, approved, readiness, hasWork, formDraft, onContinue, onNew, onForms, onInterviews, onChat }: { study: Study; approved: number; readiness: number; hasWork: boolean; formDraft: FormDraftSummary | null; onContinue: () => void; onNew: () => void; onForms: () => void; onInterviews: () => void; onChat: () => void }) {
  const draftFindings = study.themes.length - approved;
  const topFinding = study.themes.find(theme => theme.status === "approved") ?? study.themes[0];
  const openPath = (id: string) => id === "interviews" ? onInterviews() : onForms();

  // An unfinished form is the same door, relabelled. Offering "Create a form"
  // next to a half-written one reads as a second form rather than the way back
  // into the one already started.
  const paths = RESEARCH_PATHS.map(path => path.id === "form" && formDraft
    ? { ...path, title: "Complete your form", body: `${formDraft.name} has ${formDraft.questions} ${formDraft.questions === 1 ? "question" : "questions"} saved. Pick up where you stopped, then publish it.`, go: "Continue" }
    : path);

  return <section className="home-view page-pad">
    <div className="home-opener">
      <div className="home-intro">
        <span className="eyebrow">Research workspace</span>
        <h1>Turn research into <em className="hero-mark">decisions</em>.</h1>
        <p className="home-lede">Move from interviews, forms and research documents to reviewed findings, exact quotes, and a report people can trust.</p>
        <div className="home-actions">
          <button className="primary-button" onClick={onNew}>Start a new study<ArrowRight size={17}/></button>
          {hasWork && <button className="outline-button" onClick={onContinue}>Continue the study you left</button>}
        </div>
        <button className="hero-chat" onClick={onChat}>
          <span className="hero-chat-mark"><Bot size={17}/></span>
          <span><b>Ask Glean</b><small>Answers cited to the interviews</small></span>
          <ArrowRight size={16}/>
        </button>
      </div>

      <aside className="active-study-card" aria-label="Active study">
        <span className="eyebrow">Active study</span>
        <h2>{study.title}</h2>
        <p>{study.goal}</p>
        <dl className="study-metrics">
          <div><dt>Interviews</dt><dd>{study.interviews.length}</dd></div>
          <div><dt>Approved</dt><dd>{approved}</dd></div>
          <div><dt>To review</dt><dd>{draftFindings}</dd></div>
        </dl>
        <div className="study-readiness">
          <div><span>Review readiness</span><b>{readiness}%</b></div>
          <i><b style={{ width: `${readiness}%` }}/></i>
        </div>
        <button className="primary-button" onClick={onContinue}>Open study<ArrowRight size={16}/></button>
      </aside>
    </div>

    <section className="home-paths" aria-label="Start research">
      <h2 className="section-title">Where do you want to start?</h2>
      <div className="path-grid">
        {paths.map(path => {
          const Icon = path.icon;
          return <button key={path.id} className={`path-card tone-${path.tone}`} onClick={() => openPath(path.id)}>
            <span className="path-icon"><Icon size={22}/></span>
            <b>{path.title}</b>
            <p>{path.body}</p>
            <span className="path-go">{path.go}<ArrowRight size={16}/></span>
          </button>;
        })}
      </div>
    </section>

    <div className="home-lower">
      <section className="synthesis-card">
        <span className="eyebrow">Latest synthesis</span>
        {topFinding ? <>
          <h2>{topFinding.title}</h2>
          <p>{topFinding.summary}</p>
          {topFinding.evidence[0] && <figure className="synthesis-quote">
            <blockquote>{topFinding.evidence[0].quote}</blockquote>
            <figcaption>{topFinding.evidence[0].participantCode} · {topFinding.evidence[0].participantRole}</figcaption>
          </figure>}
          <button className="text-button" onClick={onContinue}>Review findings<ArrowRight size={16}/></button>
        </> : <>
          <h2>No findings yet</h2>
          <p>Add interview transcripts, then run analysis to surface the patterns worth reviewing.</p>
          <button className="text-button" onClick={onInterviews}>Add interviews<ArrowRight size={16}/></button>
        </>}
      </section>

      <section className="chat-card">
        <span className="chat-mark"><Bot size={20}/></span>
        <h2>Study chat</h2>
        <p>Ask a question and get an answer drawn only from your interviews and approved findings.</p>
        <button className="chat-question" onClick={onChat}>What should we change in onboarding?</button>
        <button className="chat-question" onClick={onChat}>Which problems have the strongest support?</button>
        <button className="outline-button" onClick={onChat}>Open chat<SendHorizontal size={16}/></button>
      </section>
    </div>

    <ul className="home-principles">
      <li><b>Quote first</b><span>Every finding shows the participant quotes behind it, so you can check a claim before approving it.</span></li>
      <li><b>Stays in this workspace</b><span>Raw transcripts are never included in an exported report.</span></li>
      <li><b>5–20 interviews</b><span>Enough for patterns to repeat without taking longer to review than the research is worth.</span></li>
    </ul>
  </section>;
}


function StudiesView({ study, formDraft, onOpen, onNew, onForms }: { study: Study; formDraft: FormDraftSummary | null; onOpen: () => void; onNew: () => void; onForms: () => void }) {
  const [query, setQuery] = useState("");
  const matches = study.title.toLowerCase().includes(query.toLowerCase()) || study.goal.toLowerCase().includes(query.toLowerCase());
  return <section className="studies-view page-pad">
    <div className="research-header">
      <div><span className="eyebrow">RESEARCH</span><h1>Your research workspace.</h1><p>Plan studies, collect interviews, create forms, and move reviewed findings into reports from one place.</p></div>
      <div className="research-actions"><button className="outline-button" onClick={onForms}><ClipboardList size={17}/>{formDraft ? "Complete form" : "Create form"}</button><button className="primary-button" onClick={onNew}><Plus size={17}/>New study</button></div>
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
        <section><span className="eyebrow">NEXT BEST ACTION</span>{formDraft
          ? <><h2>Finish {formDraft.name}</h2><p>{formDraft.questions} {formDraft.questions === 1 ? "question" : "questions"} are saved in the builder. Review the wording, then publish to get a respondent link.</p><button className="primary-button" onClick={onForms}><ClipboardList size={17}/>Complete form</button></>
          : <><h2>Generate a research form</h2><p>Give Glean the goal, audience, and decision. It drafts the screener, consent, and questions so you are editing structure instead of building from zero.</p><button className="primary-button" onClick={onForms}><Sparkles size={17}/>Start with context</button></>}</section>
        <section><span className="eyebrow">WORKFLOW</span><ol className="research-flow">{["Brief", "Form", "Responses", "Findings"].map((step, index, all) =>
          <li key={step}>{index > 0 && <ChevronRight size={14} aria-hidden="true"/>}<span>{step}</span></li>)}</ol></section>
      </aside>
    </div>
  </section>;
}

/**
 * Where the form sits in its lifecycle.
 *
 * This replaces four independent pieces of state — generated, published,
 * backendFormId and backendShareUrl — that nothing kept in agreement. They
 * drifted apart in practice: a form restored from localStorage came back
 * `published` with no id or link, so the builder showed a "Published" chip
 * directly above "Draft not generated" and offered a share link that pointed at
 * nothing. Switching drafts was worse, because the previous form's link stayed
 * behind under the new form's name.
 *
 * A published form now carries its own link, so "published without a link" is
 * not a value anyone can construct.
 */
type FormLifecycle =
  | { kind: "blank" }
  | { kind: "draft" }
  | { kind: "published"; formId: string; shareUrl: string };

/** Review is a sequence, not two booleans: approved-but-never-requested was representable. */
type ReviewState =
  | { kind: "none" }
  | { kind: "requested"; sentTo: string; note: string }
  | { kind: "approved"; sentTo: string; note: string };

type SavedForm = { id: string; name: string; slug: string; sections: FormSection[]; context: { goal?: string; audience?: string; decision?: string }; version: number; role: string; status: string; token?: string; expires_at: string | null };

function FormsView({ study, userId, onOpenStudy, onCopied, onImportResponses }: { study: Study; userId?: string; onOpenStudy: () => void; onCopied: () => void; onImportResponses: (items: Interview[]) => void }) {
  const [analytics, setAnalytics] = useState<{ total: number; questions: Record<string, { answered: number; values: Record<string, number> }> } | null>(null);
  const [savedForms, setSavedForms] = useState<SavedForm[]>([]);
  const [cloudForm, setCloudForm] = useState<SavedForm | null>(null);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
  const [responseTotal, setResponseTotal] = useState(0);
  const [responsePage, setResponsePage] = useState(0);
  const [hasMoreResponses, setHasMoreResponses] = useState(false);
  const mayEdit = !cloudForm || ["owner", "editor"].includes(cloudForm.role);
  const mayPublish = !cloudForm || cloudForm.role === "owner";
  const draftStorageKey = userId ? `glean-form-draft-v1:${userId}` : "glean-form-draft-v1";
  const [lifecycle, setLifecycle] = useState<FormLifecycle>({ kind: "blank" });
  const [showEditor, setShowEditor] = useState(true);
  const [responses, setResponses] = useState<{ id: string; answers: Record<string, string>; createdAt: string; sections?: FormSection[] }[]>([]);
  const [moved, setMoved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expiry, setExpiry] = useState("7 days");
  const [anonymous, setAnonymous] = useState(true);
  const [origin, setOrigin] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [setupStep, setSetupStep] = useState<"source" | "context" | "review">("source");
  const [publishing, setPublishing] = useState(false);
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
    const stored = window.localStorage.getItem(draftStorageKey);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as { formName?: string; researchGoal?: string; audience?: string; decision?: string; sections?: FormSection[]; drafts?: FormDraft[]; activeDraftId?: string; lifecycle?: FormLifecycle; generated?: boolean; published?: boolean };
      const restoredFormName = draft.formName && !isLegacyContextValue("formName", draft.formName) ? draft.formName : "";
      if (restoredFormName) setFormName(restoredFormName);
      if (draft.researchGoal && !isLegacyContextValue("researchGoal", draft.researchGoal)) setResearchGoal(draft.researchGoal);
      if (draft.audience && !isLegacyContextValue("audience", draft.audience)) setAudience(draft.audience);
      if (draft.decision && !isLegacyContextValue("decision", draft.decision)) setDecision(draft.decision);
      if (draft.sections?.length) setSections(removeContextEchoQuestions(draft.sections, restoredFormName || draft.formName || ""));
      if (draft.drafts?.length) setDrafts(draft.drafts.map(item => ({ ...item, sections: removeContextEchoQuestions(item.sections, item.name) })));
      if (draft.activeDraftId) setActiveDraftId(draft.activeDraftId);
      // Restores to draft even if the stored payload says published: the public
      // token is never written to localStorage, so a "published" form restored
      // here would have no link to share. `generated`/`published` are the
      // pre-union keys, still read so older saved drafts keep their questions.
      if (draft.lifecycle?.kind === "draft" || draft.generated || draft.published) setLifecycle({ kind: "draft" });
    } catch { /* keep default form */ }
  }, []);
  const generated = lifecycle.kind !== "blank";
  const published = lifecycle.kind === "published";
  const backendFormId = cloudForm?.id ?? (lifecycle.kind === "published" ? lifecycle.formId : "");
  const questionCount = sections.reduce((total, section) => total + section.questions.length, 0);
  const formSlug = slugify(formName || "research-form");
  const formPath = `/forms/${formSlug}`;
  const encodedDraft = encodeFormDraftForUrl({ name: formName, sections });
  const shareUrl = lifecycle.kind === "published"
    ? lifecycle.shareUrl
    : `${origin || "http://localhost:3210"}${formPath}${encodedDraft ? `?draft=${encodedDraft}` : ""}`;
  const activeDraft = drafts.find(draft => draft.id === activeDraftId);
  const importedActiveDraft = Boolean(activeDraft && activeDraft.source !== "Generated from context");
  const hasContextForDraft = Boolean(formName.trim() && researchGoal.trim() && audience.trim() && decision.trim());
  const selectDraft = (draft: FormDraft) => {
    setCloudForm(null); setResponses([]); setResponseTotal(0);
    setActiveDraftId(draft.id);
    setFormName(draft.name);
    setSections(draft.sections);
    setResearchGoal(draft.goal ?? `Review questions imported from ${draft.source}.`);
    setAudience(draft.audience);
    setDecision(draft.purpose);
    // A stored draft records that it was published once, but not the token that
    // makes the link work, so selecting it opens a draft rather than showing a
    // share card carrying the previously selected form's link.
    setLifecycle({ kind: "draft" });
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
      const result = await readApiResponse(response, "Glean could not import this document");
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
  const saveDraft = async () => {
    if (userId) { await persistForm(false); return; }
    const draft: FormDraft = { id: activeDraftId || `draft-saved-${Date.now()}`, name: formName.trim() || "Untitled research form", goal: researchGoal, purpose: decision, audience, status: "Draft", sections, source: activeDraft?.source ?? "Saved draft" };
    setDrafts(current => activeDraftId && current.some(item => item.id === activeDraftId) ? current.map(item => item.id === activeDraftId ? { ...item, ...draft, id: activeDraftId } : item) : [draft, ...current]);
    setActiveDraftId(draft.id);
    setLifecycle({ kind: "draft" });
    window.localStorage.setItem(draftStorageKey, JSON.stringify({ formName, researchGoal, audience, decision, sections, drafts: activeDraftId ? drafts.map(item => item.id === activeDraftId ? { ...item, ...draft, id: activeDraftId } : item) : [draft, ...drafts], activeDraftId: draft.id, lifecycle: { kind: "draft" } }));
    setImportMessage("Draft saved. You can leave this page and come back to keep editing.");
  };
  const publishToBackend = async () => { await persistForm(true); };
  const loadSavedForm = (form: SavedForm) => {
    setCloudForm(form); setFormName(form.name); setSections(form.sections); setResearchGoal(form.context?.goal ?? ""); setAudience(form.context?.audience ?? ""); setDecision(form.context?.decision ?? ""); setActiveDraftId(""); setResponses([]); setResponseTotal(0); setAnalytics(null); setMoved(false);
    window.localStorage.setItem("glean:last-open-form", form.id);
    const cached = window.sessionStorage.getItem(`glean-link:${userId}:${form.id}`) ?? "";
    setLifecycle(form.status === "published" ? { kind: "published", formId: form.id, shareUrl: cached } : { kind: "draft" });
    setShowPreview(false);
    setShowEditor(form.status !== "published");
    setRemoteUpdateAvailable(false);
    setSetupStep("review");
  };
  const reloadCloudForm = async () => {
    if (!cloudForm) return;
    try {
      const response = await fetch(`/api/forms/workspace?formId=${cloudForm.id}`, { cache: "no-store" });
      const data = await readApiResponse(response, "Glean could not load the latest form");
      if (!response.ok) throw new Error(data.error ?? "Could not load the latest form.");
      if (window.confirm("Load the latest saved version? Unsaved changes on this screen will be lost.")) {
        loadSavedForm(data.form);
        setImportMessage("Latest team version loaded.");
      }
    } catch (error) { setImportMessage(readableError(error)); }
  };
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let firstLoad = true;
    const refreshForms = async () => {
      try {
        const response = await fetch("/api/forms/workspace", { cache: "no-store" });
        const result = await response.json();
        if (response.status === 401) {
          window.location.replace("/signin?error=session-ended");
          return;
        }
        if (!response.ok) throw new Error(result.error);
        if (!active) return;
        setSavedForms(result.forms);
        if (firstLoad) {
          const requested = new URLSearchParams(window.location.search).get("form");
          const remembered = window.localStorage.getItem("glean:last-open-form");
          const form = result.forms.find((item: SavedForm) => item.id === requested)
            ?? result.forms.find((item: SavedForm) => item.id === remembered)
            ?? result.forms[0];
          if (form) loadSavedForm(form);
          firstLoad = false;
        }
      } catch (error) { if (active) setImportMessage(error instanceof Error ? error.message : "Could not refresh forms."); }
    };
    refreshForms();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refreshForms(); }, 10000);
    const onFocus = () => refreshForms();
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [userId]);

  useEffect(() => {
    if (!cloudForm) return;
    const current = savedForms.find(form => form.id === cloudForm.id);
    if (!current) {
      setCloudForm(null); setFormName(""); setSections([]); setResearchGoal(""); setAudience(""); setDecision("");
      setResponses([]); setResponseTotal(0); setAnalytics(null); setLifecycle({ kind: "blank" });
      setImportMessage("You no longer have access to this form.");
      return;
    }
    if (current.role !== cloudForm.role) {
      setCloudForm(previous => previous ? { ...previous, role: current.role } : previous);
      if (current.role === "reviewer") { setResponses([]); setResponseTotal(0); setAnalytics(null); }
      setImportMessage(`Your access changed to ${current.role}.`);
    }
    if (current.version > cloudForm.version) setRemoteUpdateAvailable(true);
  }, [savedForms]);
  const persistForm = async (publish: boolean) => {
    if (!formName.trim()) {
      setImportMessage("Give the form a name before publishing — respondents see it at the top of the page.");
      setSetupStep("context");
      return;
    }
    setPublishing(true);
    setImportMessage("Creating a test link…");
    try {
      const response = await fetch(publish ? "/api/forms/publish" : "/api/forms/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: backendFormId || undefined, version: cloudForm?.version, name: formName.trim(), slug: formSlug, sections, context: { goal: researchGoal, audience, decision }, publish, expiresDays: parseInt(expiry) || 7 })
      });
      const result = await readApiResponse(response, "Glean could not publish this form");
      if (!response.ok) throw new Error(result.error ?? "Could not publish form");
      const form: SavedForm = result.form;
      const token = form.token;
      const url = token ? `${window.location.origin}/forms/${form.slug}?token=${token}` : window.sessionStorage.getItem(`glean-link:${userId}:${form.id}`) ?? "";
      if (url) window.sessionStorage.setItem(`glean-link:${userId}:${form.id}`, url);
      setCloudForm(form); setSavedForms(current => [form, ...current.filter(f => f.id !== form.id)]); setRemoteUpdateAvailable(false);
      setLifecycle(form.status === "published" ? { kind: "published", formId: form.id, shareUrl: url } : { kind: "draft" });
      if (publish) setShowPreview(true);
      setImportMessage(publish ? "Published. Respondents can use the link until its expiry date." : "Draft saved to your account. Teammates can reload it to see these changes.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Could not create backend link.");
    } finally {
      setPublishing(false);
    }
  };
  const refreshBackendResponses = async (page = 0) => {
    if (!backendFormId) {
      setImportMessage("Publish the form before loading responses.");
      return;
    }
    try {
      const response = await fetch(`/api/forms/responses?formId=${encodeURIComponent(backendFormId)}&page=${page}`);
      const result = await readApiResponse(response, "Glean could not load responses");
      if (!response.ok) throw new Error(result.error ?? "Could not load responses");
      const rows = result.responses ?? [];
      setResponses(rows);
      setResponseTotal(result.total); setResponsePage(page); setHasMoreResponses(result.hasMore);
      const stats = await fetch(`/api/forms/analytics?formId=${encodeURIComponent(backendFormId)}`);
      if (stats.ok) setAnalytics(await stats.json());
      // The queued-for-analysis notice describes the list being replaced here.
      setMoved(false);
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
    setLifecycle({ kind: "draft" });
    setShowEditor(true);
    setSetupStep("review");
    setImportMessage(`Drafted ${draft.sections.reduce((total, section) => total + section.questions.length, 0)} editable questions from your research context.`);
  };
  return <section className="forms-view page-pad">
    <div className="research-header">
      <div><span className="eyebrow">RESEARCH FORMS</span><h1>Create a form without starting from scratch.</h1><p>Upload a research plan or describe what you need to learn. Glean turns it into editable form drafts you can review, publish, and analyse.</p></div>
      <button className="outline-button" onClick={onOpenStudy}><Upload size={17}/>Analyse interviews</button>
    </div>
    {userId && <section className="saved-form-library"><label>Saved forms<select value={cloudForm?.id ?? ""} onChange={event => { const form = savedForms.find(f => f.id === event.target.value); if (form && window.confirm("Open the saved version? Save your current edits first.")) loadSavedForm(form); }}><option value="">Choose a form</option>{savedForms.map(f => <option key={f.id} value={f.id}>{f.name} · {f.role} · {f.status}</option>)}</select></label>{cloudForm && <button className="outline-button" onClick={reloadCloudForm}>Reload saved version</button>}<button className="outline-button" onClick={() => { if (window.confirm("Start a new form? Save your current edits first.")) { setCloudForm(null); setRemoteUpdateAvailable(false); setLifecycle({ kind: "blank" }); setFormName(""); setSections([]); setActiveDraftId(""); setResponses([]); setSetupStep("source"); } }}>New form</button></section>}
    <div className="form-builder-grid">
      <section className="form-context-panel">
        <div className="setup-panel-head"><span className="eyebrow">FORM SETUP</span><h2>Prepare the draft</h2><p>Bring in source material, confirm the research context, then decide whether this needs team review before sharing.</p></div>
        <div className="setup-switcher" role="tablist" aria-label="Form setup steps">
          <button className={setupStep === "source" ? "active" : ""} onClick={() => setSetupStep("source")}><span>1</span>Source</button>
          <button className={setupStep === "context" ? "active" : ""} onClick={() => setSetupStep("context")}><span>2</span>Context</button>
          <button className={setupStep === "review" ? "active" : ""} onClick={() => setSetupStep("review")}><span>3</span>Review</button>
        </div>
        <div className="setup-steps">
        <div className={`setup-step ${setupStep === "source" ? "active" : ""}`}>
          <fieldset disabled={!mayEdit} className="setup-content form-access-fields">
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
          </fieldset>
        </div>
        <div className={`setup-step ${setupStep === "context" ? "active" : ""}`}>
          <fieldset disabled={!mayEdit} className="setup-content form-access-fields">
            <div className="setup-label"><b>Research context</b><small>Required if you do not import a document. These fields tell Glean what to draft.</small></div>
            <label>Form name<input value={formName} onChange={event => setFormName(event.target.value)} placeholder="e.g. Feminine wellness discovery form"/></label>
            <label>Research goal<textarea rows={4} value={researchGoal} onChange={event => setResearchGoal(event.target.value)} placeholder="What are you trying to learn or validate?"/></label>
            <label>Audience<input value={audience} onChange={event => setAudience(event.target.value)} placeholder="Who should answer this form?"/></label>
            <label>Decision this should inform<input value={decision} onChange={event => setDecision(event.target.value)} placeholder="What decision should these answers support?"/></label>
            <button className="context-draft-button" onClick={generateForm} disabled={importedActiveDraft || !hasContextForDraft}><Sparkles size={16}/>Draft form from context</button>
            {!hasContextForDraft && <p className="context-hint">Complete the four context fields to draft without uploading a document.</p>}
            <button className="setup-next" onClick={() => setSetupStep("review")}>Continue to review<ChevronRight size={15}/></button>
          </fieldset>
        </div>
        <div className={`setup-step setup-step-last ${setupStep === "review" ? "active" : ""}`}>
          <div className="setup-content">
            <div className="setup-label"><b>Team access and review</b><small>Invite a teammate, choose their access, and discuss the saved form.</small></div>
            <FormTeam key={backendFormId} formId={backendFormId} role={cloudForm?.role ?? "owner"}/>
          </div>
        </div>
        </div>
      </section>
      <section className="form-preview-panel">
        <div className="section-bar"><div><span className="eyebrow">{published ? "PUBLIC FORM" : "FORM BUILDER"}</span><h2>{generated ? formName : "Review and shape the form"}</h2></div><div className="section-bar-meta"><span className={`status-chip ${published ? "published" : ""}`}>{published ? "Published" : "Draft"}</span><span className="question-count">{questionCount} {questionCount === 1 ? "question" : "questions"}</span></div></div>
        <div className="builder-toolbar refined-toolbar">
          <div className="toolbar-status">
            <span>{importedActiveDraft ? <Check size={15}/> : <Sparkles size={15}/>}</span>
            <div><b>{published ? "Published" : importedActiveDraft ? "Imported draft" : generated ? "Generated draft" : "Draft not generated"}</b><small>{published ? "Live at the link below. Publishing again updates this same form and keeps the responses you already have." : importedActiveDraft ? "Questions came from your upload. Clean them up before sharing." : generated ? "Save and preview, then publish when it is ready." : "Generate from context or upload a document to begin."}</small></div>
          </div>
          <div className="toolbar-actions" aria-label="Form builder actions">
            {!importedActiveDraft && !generated && <button className="toolbar-secondary action-generate" onClick={generateForm}><Sparkles size={15}/>Generate</button>}
            <button className="toolbar-secondary" onClick={saveDraft} disabled={!questionCount || !mayEdit || publishing}><Save size={15}/>Save</button>
            <button className="toolbar-secondary" onClick={() => setShowPreview(value => !value)} disabled={!questionCount}><Eye size={15}/>{showPreview ? "Hide" : "Preview"}</button>
            <button className="toolbar-secondary" onClick={() => setShowEditor(value => !value)} disabled={!questionCount}>{showEditor ? "Hide editor" : mayEdit ? "Edit questions" : "Review questions"}</button>
            <button className="toolbar-primary" onClick={publishToBackend} disabled={!questionCount || publishing || !mayPublish}><Share2 size={15}/>{publishing ? "Saving…" : published ? "Update published form" : "Publish"}</button>
          </div>
        </div>
        {remoteUpdateAvailable && <div className="team-update-banner" role="status"><div><b>A teammate saved a newer version</b><span>Your current edits are still here. Load the team version when you are ready.</span></div><button className="outline-button" onClick={reloadCloudForm}>Review latest</button></div>}
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
          {shareUrl ? <div className="share-link-row"><code>{shareUrl}</code><button onClick={copyShareLink}>Copy link</button><a href={shareUrl} target="_blank" rel="noreferrer">Open form</a></div> : <p>The existing respondent link is unchanged. For security, it is shown only in the browser session that created it. The owner can replace it below.</p>}
          {mayPublish && cloudForm && <div className="response-actions">{["close", "replace-link"].map(action => <button key={action} className="outline-button" onClick={async () => { if (!window.confirm(action === "close" ? "Close this form? Existing links will stop accepting responses." : "Replace the respondent link? The old link will stop working.")) return; try { const r = await fetch("/api/forms/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, formId: cloudForm.id, version: cloudForm.version }) }); const result = await r.json(); if (!r.ok) throw new Error(result.error); if (result.form.token) window.sessionStorage.setItem(`glean-link:${userId}:${cloudForm.id}`, `${window.location.origin}/forms/${result.form.slug}?token=${result.form.token}`); else window.sessionStorage.removeItem(`glean-link:${userId}:${cloudForm.id}`); loadSavedForm(result.form); setImportMessage(action === "close" ? "Form closed. Existing responses are retained." : "New link created. The old link no longer works."); } catch (error) { setImportMessage(readableError(error)); } }}>{action === "close" ? "Close form" : "Replace link"}</button>)}</div>}
          <div className="share-settings">
            <label>Expiry on next publish<select disabled={!mayPublish} value={expiry} onChange={event => setExpiry(event.target.value)}><option>7 days</option><option>14 days</option><option>30 days</option></select></label>
            <label className="checkbox-row"><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)}/><span>Collect anonymous responses</span></label>
          </div>
          <small>{anonymous ? "Names and emails are not requested on the respondent form." : "Respondent identity collection is off in this prototype until consent fields are configured."} {backendFormId ? "Responses from this link appear in your dashboard." : "Publish to collect responses."}</small>
        </div>}
        {showPreview && <div className="public-form-preview">
          <div className="preview-paper">
            <span className="respondent-badge">Question summary</span>
            <h3>{formName}</h3>
            <p>Help the research team understand your experience, pain points, and what would make a better solution feel useful and trustworthy.</p>
            {sections.map((section, sectionIndex) => <section className="preview-section" key={`preview-${section.id}`}><small>Section {sectionIndex + 1} · {section.questions.length} {section.questions.length === 1 ? "question" : "questions"}</small><h4>{section.title}</h4>{section.questions.map((question, index) => <div className="preview-question" key={question.id}><span>{index + 1}</span><b>{question.text}</b><em>{question.type === "open" ? "Long answer" : question.type === "single" ? "Multiple choice" : "Rating scale"}{question.logic?.targetSectionId ? ` · can skip to ${sections.find(item => item.id === question.logic?.targetSectionId)?.title ?? "another section"}` : ""}</em></div>)}</section>)}
            {published ? <a className="primary-button" href={shareUrl} target="_blank" rel="noreferrer">Open the respondent form<ArrowRight size={16}/></a> : <p className="preview-note">Publish to see and share the respondent form.</p>}
          </div>
        </div>}
        {showEditor && <div className="editor-disclosure"><div><span className="eyebrow">{mayEdit ? "FORM BUILDER" : "READ-ONLY FORM"}</span><h3>{mayEdit ? "Edit form sections" : "Review form sections"}</h3><p>{mayEdit ? "Add, rename, reorder, and tune the questions before publishing." : "Your role can review this form and leave notes, but cannot change its questions."}</p></div></div>}
        {showEditor && <fieldset disabled={!mayEdit} className="editable-form form-access-fields">{sections.map((section, sectionIndex) => <section key={section.id} className="editable-section">
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
        </section>)}</fieldset>}
        {cloudForm?.role !== "reviewer" && <div className="responses-panel">
          <div className="section-bar">
            <div>
              <span className="eyebrow">RESPONSES</span>
              <h3>{responseTotal} collected</h3>
              <p>{published
                ? "Answers submitted through your respondent link. Read them here, then bring them into the study as an evidence source."
                : "Publish the form before collecting responses."}</p>
            </div>
          </div>
          <div className="response-actions">
            <button className="outline-button" onClick={() => refreshBackendResponses()} disabled={!backendFormId || cloudForm?.role === "reviewer"}><MessageSquareText size={16}/>Refresh responses</button>
            <button className="primary-button" disabled={!responses.length} onClick={() => { onImportResponses(responses.map((r, index) => { const transcript = (r.sections ?? sections).flatMap(s => s.questions).filter(q => r.answers[q.id]?.trim()).map(q => `Interviewer: ${q.text}\nParticipant: ${r.answers[q.id]}`).join("\n\n"); return { id: `response-${r.id}`, participant: { id: r.id, code: `R${r.id.slice(0, 8)}`, role: "Survey respondent", segment: formName, accent: "purple" }, title: `${formName} response`, date: r.createdAt, source: "paste" as const, wordCount: transcript.split(/\s+/).length, status: "ready" as const, transcript, summary: "Imported survey answers. Review the source before drawing conclusions." }; })); setMoved(true); }}><BarChart3 size={16}/>Add this page to study</button>
          </div>
          {moved && <div className="analysis-ready"><Check size={16}/><span>These responses are now study sources. Importing them again will not create duplicates.</span></div>}
          {analytics && <section className="response-analytics"><h3>Response summary</h3><p>Based on all {analytics.total} responses. Counts show answers, not AI conclusions.</p>{sections.flatMap(s => s.questions).filter(q => analytics.questions[q.id]).map(q => { const stat = analytics.questions[q.id]; return <article key={q.id}><h4>{q.text}</h4><small>{stat.answered} answered · {analytics.total - stat.answered} skipped</small>{Object.entries(stat.values).map(([answer, count]) => <div className="answer-stat" key={answer}><span>{answer}</span><meter min={0} max={Math.max(1, stat.answered)} value={count}/><b>{count} ({Math.round(count / stat.answered * 100)}%)</b></div>)}</article>; })}</section>}
          {responses.length > 0 && <ol className="response-list">
            {responses.map((response, index) => {
              const questions = (response.sections ?? sections).flatMap(section => section.questions);
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
          {responseTotal > 50 && <div className="response-actions"><button className="outline-button" disabled={!responsePage} onClick={() => refreshBackendResponses(responsePage - 1)}>Previous</button><span>Page {responsePage + 1} · {responseTotal} total responses</span><button className="outline-button" disabled={!hasMoreResponses} onClick={() => refreshBackendResponses(responsePage + 1)}>Next</button></div>}
        </div>}
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
  const result = await readApiResponse(response, "Glean could not import this file");
  if (!response.ok) throw new Error(result.error ?? "Could not extract this file");
  return String(result.text ?? "");
}

async function readApiResponse(response: Response, fallback: string): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (!contentType.includes("application/json")) {
    if (response.status === 413) {
      throw new Error("That file is too large to upload. Try a file under 10 MB, or split it into smaller documents.");
    }
    if (response.status >= 500) {
      throw new Error(`${fallback}. Glean could not reach the document service. Please try again in a moment.`);
    }
    throw new Error(`${fallback}. The server returned an unexpected response (${response.status}).`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${fallback}. Glean received an unreadable response. Please try again.`);
  }
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
        {/* The summary was written on every interview and shown on none of them,
            so the list gave you no way to tell two participants apart without
            opening a transcript. */}
        <span><b>{interview.participant.role}</b><small>{interview.participant.segment}</small>{interview.summary && <em className="interview-summary">{interview.summary}</em>}</span>
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

/** Interviews a finding actually quotes — not the stored `participantCount`, which nothing verifies. */
const quotedIn = (item: Theme) => new Set(item.evidence.map(evidence => evidence.interviewId)).size;

function FindingsStage({ study, theme, index, onSelect, onPrevious, onNext, onEvidence, onStatus, onAdd, onAnalyse }: { study: Study; theme: Theme | null; index: number; onSelect: (index: number) => void; onPrevious: () => void; onNext: () => void; onEvidence: (evidence: Evidence) => void; onStatus: (id: string, status: ThemeStatus) => void; onAdd: () => void; onAnalyse: () => void }) {
  if (!study.interviews.length) return <EmptyStage eyebrow="STEP 1 · ADD INTERVIEWS" title="Add interviews before looking for patterns." text="Glean needs participant conversations before it can draft findings." action="Add first interview" onAction={onAdd}/>;
  if (!theme) return <EmptyStage eyebrow="STEP 2 · REVIEW FINDINGS" title="Your interviews are ready to analyse." text="Run analysis to surface early patterns linked to exact transcript quotes." action={`Analyse ${study.interviews.length} interviews`} onAction={onAnalyse}/>;

  // Coverage is counted from the interviews this finding actually quotes, not
  // from a stored integer nothing verifies.
  const supporting = new Set(theme.evidence.map(item => item.interviewId));
  const covered = supporting.size;
  const total = study.interviews.length;
  const percent = total ? Math.round((covered / total) * 100) : 0;
  const approved = study.themes.filter(item => item.status === "approved").length;
  const rejected = study.themes.filter(item => item.status === "rejected").length;
  const toReview = study.themes.length - approved - rejected;

  return <section className="finding-stage page-pad">
    <div className="finding-layout">
      {/* Reviewing findings one at a time behind Previous/Next hid the shape of
          the set: how many there are, which are still waiting on you, and how
          the one on screen compares. The index makes the whole review legible
          and turns "the third one, the pricing one" into a single click. */}
      <aside className="finding-index" aria-label="Findings in this study">
        <div className="finding-index-head">
          <span className="eyebrow">FINDINGS</span>
          <h2>{study.themes.length} in this study</h2>
          <div className="finding-tally">
            {toReview > 0 && <span className="tally-draft">{toReview} to review</span>}
            {approved > 0 && <span className="tally-approved">{approved} approved</span>}
            {rejected > 0 && <span className="tally-rejected">{rejected} rejected</span>}
          </div>
        </div>
        <ol className="finding-index-list">
          {study.themes.map((item, position) => {
            const quoted = quotedIn(item);
            return <li key={item.id}>
              <button
                className={`${position === index ? "active" : ""} ${item.status}`}
                onClick={() => onSelect(position)}
                aria-current={position === index ? "true" : undefined}
              >
                <span className="finding-index-num">{position + 1}</span>
                <span className="finding-index-body">
                  <b>{item.title}</b>
                  <em><i className={`strength-dot ${item.strength}`} aria-hidden="true"/>{STRENGTH_LABEL[item.strength]} · {quoted} {quoted === 1 ? "participant" : "participants"}</em>
                </span>
                {item.status === "approved" && <Check size={15} aria-label="Approved"/>}
                {item.status === "rejected" && <X size={15} aria-label="Rejected"/>}
              </button>
            </li>;
          })}
        </ol>
      </aside>

      <div className="finding-detail">
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
              {/* Tags were modelled and analysed on, but never shown. */}
              {theme.tags.map(tag => <span className="tag-chip" key={tag}>{tag}</span>)}
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
      </div>
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



type ChatDestination = "interviews" | "findings" | "report" | "forms";

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: Evidence[];
  /** An answer the study could not support — rendered as a refusal, not a claim. */
  unsupported?: boolean;
  /** Somewhere the answer points at, offered as a button under the reply. */
  action?: { label: string; to: ChatDestination };
};

/** Where the person is, so chat can answer "what next" from the same facts. */
type ChatContext = { area: Area; stage: Stage; formDraft: FormDraftSummary | null };

const CHAT_PLACE: Record<string, string> = {
  home: "Home",
  studies: "Studies",
  forms: "Form builder",
  help: "Help",
  settings: "Settings",
  interviews: "Add interviews",
  findings: "Review findings",
  report: "Present report"
};

const chatPlaceLabel = (context: ChatContext) =>
  CHAT_PLACE[context.area === "study" ? context.stage : context.area] ?? "Glean";

/**
 * The single next thing worth doing, derived from the study rather than a
 * fixed script — the same computation the answer and the quick-jump row share,
 * so they cannot disagree.
 */
function nextStep(study: Study, context: ChatContext): { text: string; action: { label: string; to: ChatDestination } } {
  if (!study.interviews.length) {
    return {
      text: "This study has no interviews yet, so there is nothing for me to answer from. Add five to twenty transcripts and run analysis — findings only exist once there are participant words behind them.",
      action: { label: "Add interviews", to: "interviews" }
    };
  }
  if (!study.themes.length) {
    return {
      text: `You have ${study.interviews.length} ${study.interviews.length === 1 ? "interview" : "interviews"} loaded but no findings yet. Run analysis and I will be able to answer from the themes it produces.`,
      action: { label: "Run analysis", to: "interviews" }
    };
  }
  const unreviewed = study.themes.filter(theme => theme.status === "draft").length;
  if (unreviewed) {
    return {
      text: `${unreviewed} of ${study.themes.length} findings are still unreviewed. Open each one, read the quotes underneath it, and approve only the claims the evidence actually supports — the report is built from approvals.`,
      action: { label: "Review findings", to: "findings" }
    };
  }
  const approved = study.themes.filter(theme => theme.status === "approved").length;
  if (!approved) {
    return {
      text: "Every finding has been reviewed and none were approved, so the report would be empty. Re-run analysis on more interviews, or revisit the findings you rejected.",
      action: { label: "Back to findings", to: "findings" }
    };
  }
  if (context.formDraft) {
    return {
      text: `All ${study.themes.length} findings are reviewed and ${approved} are approved, so the report is ready to draft. You also have an unfinished form — ${context.formDraft.name}, ${context.formDraft.questions} ${context.formDraft.questions === 1 ? "question" : "questions"} saved.`,
      action: { label: "Open report", to: "report" }
    };
  }
  return {
    text: `All ${study.themes.length} findings are reviewed and ${approved} ${approved === 1 ? "is" : "are"} approved. The report will carry those approvals, their quotes and participant codes — raw transcripts stay in this workspace.`,
    action: { label: "Open report", to: "report" }
  };
}

/**
 * Suggestions are drawn from the study and from the screen the chat was opened
 * over. A fixed list ships prompts that get refused — the sample study never
 * mentions pricing — and prompts that are irrelevant to where you are standing:
 * "which findings are strongest" is not the question on your mind while you are
 * still uploading transcripts.
 */
function chatSuggestions(study: Study, context: ChatContext) {
  const topic = study.themes[0]?.title;
  const here = context.area === "study" ? context.stage : context.area;

  if (!study.interviews.length) {
    return ["What should I do first?", "What makes a good interview transcript?", "How many interviews do I need?"];
  }
  if (!study.themes.length) {
    return ["What should I do next?", "What does analysis actually produce?", "Why does every finding need a quote?"];
  }

  const base = here === "interviews"
    ? ["What should I do next?", "Which participants disagree with each other?"]
    : here === "report"
      ? ["What goes into the exported report?", "Which findings have the strongest support?"]
      : here === "forms"
        ? ["What should I do next?", "What did people say that this form should follow up on?"]
        : ["What should I do next?", "Which problems have the strongest support?"];

  return [...base, ...(topic ? [`What did people say about ${topic.toLowerCase()}?`] : [])];
}

/** Words that carry no signal when matching a question against a finding. */
const CHAT_STOPWORDS = new Set([
  "what", "which", "who", "when", "where", "why", "how", "the", "a", "an", "and", "or",
  "is", "are", "was", "were", "do", "does", "did", "should", "would", "could", "can",
  "we", "our", "us", "you", "they", "them", "it", "in", "on", "to", "of", "for", "from",
  "about", "with", "that", "this", "have", "has", "had", "say", "said", "people", "users"
]);

const STRENGTH_RANK: Record<Strength, number> = { dominant: 3, recurring: 2, emerging: 1 };

/** "Which problems have the strongest support?" is a ranking, not a keyword lookup. */
const RANKING_INTENT = /\b(strongest|weakest|most|least|rank|confident|confidence|support|supported|evidence|recurring|dominant|common)\b/;
/** "What should we change?" wants the reviewed findings, framed as actions. */
const ACTION_INTENT = /\b(change|improve|fix|recommend|priorit|action)\b/;
/** "What now?" is about the workspace, not the evidence — it is answered from state. */
const NEXT_INTENT = /\b(next|first|now|start|stuck|where am i|what do i do|todo|to do)\b/;

/**
 * Answers are assembled from the study, never invented. A question that does
 * not overlap any reviewed finding gets a refusal rather than a guess — that
 * behaviour is the point of the feature, so the prototype models it too.
 *
 * Two intents are handled before keyword matching, because they are about the
 * shape of the evidence rather than its wording and literal matching refuses
 * them even when the study can answer.
 */
function answerFromStudy(question: string, study: Study, context: ChatContext): ChatTurn {
  const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const asked = question.toLowerCase();
  const terms = asked.split(/[^a-z0-9]+/).filter(word => word.length > 2 && !CHAT_STOPWORDS.has(word));

  // Asked before the evidence check: "what should I do next" is answerable in
  // an empty workspace, and it is the question an empty workspace provokes.
  if (NEXT_INTENT.test(asked)) {
    const step = nextStep(study, context);
    return {
      id,
      role: "assistant",
      text: `You are on **${chatPlaceLabel(context)}**.\n\n${step.text}`,
      action: step.action
    };
  }

  if (!study.themes.length) {
    const step = nextStep(study, context);
    return {
      id,
      role: "assistant",
      unsupported: true,
      text: "There are no reviewed findings in this study yet, so I have nothing to answer from — I will not fill the gap with a guess.\n\n" + step.text,
      action: step.action
    };
  }

  if (RANKING_INTENT.test(asked)) {
    const ranked = [...study.themes].sort((left, right) =>
      STRENGTH_RANK[right.strength] - STRENGTH_RANK[left.strength] || right.participantCount - left.participantCount).slice(0, 2);
    return {
      id,
      role: "assistant",
      text: ranked.map(theme => `**${theme.title}** — ${theme.strength}, raised by ${theme.participantCount} of ${study.interviews.length} participants. ${theme.summary}`).join("\n\n"),
      citations: ranked.flatMap(theme => theme.evidence.slice(0, 1))
    };
  }

  if (ACTION_INTENT.test(asked)) {
    const reviewed = study.themes.filter(theme => theme.status === "approved");
    const basis = reviewed.length ? reviewed : study.themes;
    const caveat = reviewed.length
      ? ""
      : "\n\nNothing here is approved yet, so treat these as candidates rather than conclusions.";
    return {
      id,
      role: "assistant",
      text: basis.slice(0, 2).map(theme => `**${theme.title}** — ${theme.summary}`).join("\n\n") + caveat,
      citations: basis.slice(0, 2).flatMap(theme => theme.evidence.slice(0, 1))
    };
  }

  const scored = study.themes.map(theme => {
    const haystack = `${theme.title} ${theme.summary} ${theme.tags.join(" ")} ${theme.evidence.map(item => `${item.quote} ${item.context}`).join(" ")}`.toLowerCase();
    // Match on a light stem so "problems" finds "problem" and "pricing" finds "price".
    const hits = terms.filter(term => haystack.includes(term.replace(/(ing|es|s)$/, ""))).length;
    // Approved findings break ties only among findings the question actually
    // touched — a status bonus on a zero-hit finding would answer questions the
    // study says nothing about.
    return { theme, hits, score: hits ? hits * 2 + (theme.status === "approved" ? 1 : 0) : 0 };
  }).sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best || best.hits === 0) {
    return {
      id,
      role: "assistant",
      unsupported: true,
      text: `Nothing in these ${study.interviews.length} ${study.interviews.length === 1 ? "interview" : "interviews"} speaks to that. I would rather say so than stretch a quote to fit. Try asking about ${study.themes.slice(0, 2).map(theme => `“${theme.title.toLowerCase()}”`).join(" or ")}.`
    };
  }

  const supporting = scored.filter(entry => entry.hits > 0).slice(0, 2);
  const lead = supporting.map(entry => `**${entry.theme.title}** — ${entry.theme.summary}`).join("\n\n");
  return {
    id,
    role: "assistant",
    text: lead,
    citations: supporting.flatMap(entry => entry.theme.evidence.slice(0, 2))
  };
}

function ChatModal({ study, area, stage, formDraft, onClose, onReview, onGo }: { study: Study; area: Area; stage: Stage; formDraft: FormDraftSummary | null; onClose: () => void; onReview: () => void; onGo: (to: ChatDestination) => void }) {
  const context: ChatContext = { area, stage, formDraft };
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const replyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(replyTimer.current), []);

  // Keep the newest turn in view as the thread grows.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [turns, thinking]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || thinking) return;
    setDraft("");
    setTurns(current => [...current, { id: `q-${Date.now()}`, role: "user", text }]);
    setThinking(true);
    // Sending empties the draft, which disables the Send button. Without this
    // the browser drops focus onto <body>, outside the dialog's focus trap, so
    // Escape stops closing it and Tab restarts from the top of the page.
    composerRef.current?.focus();
    // A short pause so the answer reads as a response rather than a lookup.
    replyTimer.current = window.setTimeout(() => {
      setTurns(current => [...current, answerFromStudy(text, study, context)]);
      setThinking(false);
    }, 550);
  };

  const step = nextStep(study, context);

  return <Dialog className="chat-modal" eyebrow={`STUDY CHAT · ${chatPlaceLabel(context).toUpperCase()}`} title="Ask Glean" onClose={onClose} footer={
    <form className="chat-input" onSubmit={event => { event.preventDefault(); ask(draft); }}>
      <input
        ref={composerRef}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder="Ask about this study…"
        aria-label="Ask about this study"
      />
      <button className="primary-button" type="submit" disabled={!draft.trim() || thinking} aria-label="Send"><SendHorizontal size={16}/>Send</button>
    </form>
  }>
    <div className="chat-body" ref={threadRef}>
      {turns.length === 0 && <div className="chat-opening">
        <span className="chat-mark"><Bot size={22}/></span>
        <b>Ask anything about {study.title}</b>
        <p>Answers are drawn only from your {study.interviews.length} {study.interviews.length === 1 ? "interview" : "interviews"} and {study.themes.length} {study.themes.length === 1 ? "finding" : "findings"}, and cite the quotes behind them.</p>
        <div className="chat-next">
          <span><b>Next step</b><small>{step.text}</small></span>
          <button type="button" className="outline-button" onClick={() => onGo(step.action.to)}>{step.action.label}<ArrowRight size={15}/></button>
        </div>
        <div className="chat-suggestions">
          {chatSuggestions(study, context).map(suggestion => <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}</button>)}
        </div>
      </div>}

      {turns.map(turn => turn.role === "user"
        ? <div key={turn.id} className="chat-message user">{turn.text}</div>
        : <div key={turn.id} className={`chat-message assistant ${turn.unsupported ? "unsupported" : ""}`}>
            {turn.unsupported && <b><LockKeyhole size={14}/>Not supported by this study</b>}
            {turn.text.split("\n\n").map((paragraph, index) => <p key={index}>{renderChatText(paragraph)}</p>)}
            {turn.action && <button type="button" className="chat-action" onClick={() => onGo(turn.action!.to)}>{turn.action.label}<ArrowRight size={15}/></button>}
            {turn.citations && turn.citations.length > 0 && <div className="chat-citations">
              {turn.citations.map(citation => <button key={citation.id} type="button" className="citation-chip" onClick={onReview} title={citation.quote}>
                <Quote size={14}/>{citation.participantCode} · {citation.segmentId}
              </button>)}
            </div>}
          </div>)}

      {thinking && <div className="chat-message assistant thinking" aria-live="polite"><span/><span/><span/></div>}

      {turns.length > 0 && <div className="chat-jump">
        <span>Jump to</span>
        <button type="button" onClick={() => onGo("interviews")}>Interviews</button>
        <button type="button" onClick={() => onGo("findings")}>Findings</button>
        <button type="button" onClick={() => onGo("report")}>Report</button>
        <button type="button" onClick={() => onGo("forms")}>{formDraft ? "Complete form" : "Forms"}</button>
      </div>}

      {turns.length > 0 && <div className="chat-limits"><LockKeyhole size={16}/><span><b>Prototype retrieval.</b><small>Answers are matched against your findings on this device. Production chat still needs real retrieval, answer validation, and refusal review.</small></span></div>}
    </div>
  </Dialog>;
}

/** Minimal **bold** support so a finding title can lead its own paragraph. */
function renderChatText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <b key={index}>{part.slice(2, -2)}</b>
    : <span key={index}>{part}</span>);
}

/** Preferences that outlive a reload. The modal these replace forgot everything. */
type Preferences = { autoRedact: boolean; quoteMode: boolean; autoCollapseNav: boolean };
const DEFAULT_PREFERENCES: Preferences = { autoRedact: true, quoteMode: true, autoCollapseNav: true };
const PREFERENCES_KEY = "glean-preferences-v1";

function readPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    return raw ? { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function SettingsView({ user, study, prefs, onUpdate, onSignOut, onReset, onExportCsv, onExportWord, onStudyChange, onExportWorkspace, onImportWorkspace }: {
  user: SessionUser | null; study: Study; prefs: Preferences;
  onUpdate: (patch: Partial<Preferences>, message: string) => void;
  onSignOut: () => void; onReset: () => void; onExportCsv: () => void; onExportWord: () => void;
  onStudyChange: (patch: Partial<Study>) => void;
  onExportWorkspace: () => void; onImportWorkspace: (file: File | null) => void;
}) {
  // Saved on change rather than behind a Save button: there is nothing here a
  // person would want to fill in and then discard.
  const update = onUpdate;

  const evidenceCount = study.themes.reduce((total, theme) => total + theme.evidence.length, 0);

  return <section className="settings-view page-pad">
    <div className="research-header">
      <div>
        <span className="eyebrow">WORKSPACE</span>
        <h1>Settings</h1>
        <p>Your study syncs securely to your account. Display preferences remain on this browser and nothing here is shared with respondents.</p>
      </div>
    </div>

    <div className="settings-grid">
      <div className="settings-main">
        <section className="settings-card">
          <div className="settings-card-head"><span className="eyebrow">ACCOUNT</span><h2>Who you are signed in as</h2></div>
          <div className="settings-account">
            <span>{initialsFor(user?.email ?? null)}</span>
            <div><b>{user?.email ?? "Not signed in"}</b><small>{user ? "Study sync is connected" : "Sign in to keep your study across devices"}</small></div>
            <button className="outline-button" onClick={onSignOut}><LogOut size={15}/>{user ? "Sign out" : "Sign in"}</button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head"><span className="eyebrow">STUDY</span><h2>Name and goal</h2></div>
          <p className="settings-note">These carry into the sidebar, the breadcrumb and the exported report, so a study called &ldquo;Untitled&rdquo; ships that way.</p>
          <label className="settings-field">Study title<input value={study.title} onChange={event => onStudyChange({ title: event.target.value })} placeholder="e.g. Pricing onboarding research"/></label>
          <label className="settings-field">Research goal<textarea rows={3} value={study.goal} onChange={event => onStudyChange({ goal: event.target.value })} placeholder="What decision should this research inform?"/></label>
        </section>

        <section className="settings-card">
          <div className="settings-card-head"><span className="eyebrow">ANALYSIS</span><h2>How findings are produced</h2></div>
          <label className="switch-row">
            <span><b>Redact personal details</b><small>Analyse a copy with names, emails and phone numbers masked. The original transcript is untouched.</small></span>
            <input type="checkbox" checked={prefs.autoRedact} onChange={event => update({ autoRedact: event.target.checked }, event.target.checked ? "Redaction on" : "Redaction off")}/>
          </label>
          <label className="switch-row">
            <span><b>Require exact quotes</b><small>Hide any finding that is not tied to a passage in a transcript. Turning this off allows findings you cannot check.</small></span>
            <input type="checkbox" checked={prefs.quoteMode} onChange={event => update({ quoteMode: event.target.checked }, event.target.checked ? "Exact quotes required" : "Exact quotes no longer required")}/>
          </label>
        </section>

        <section className="settings-card">
          <div className="settings-card-head"><span className="eyebrow">WORKSPACE</span><h2>Layout</h2></div>
          <label className="switch-row">
            <span><b>Collapse the sidebar in Forms</b><small>The form builder is the widest screen in Glean, so the navigation drops to icons when you open it. You can always toggle it by hand.</small></span>
            <input type="checkbox" checked={prefs.autoCollapseNav} onChange={event => update({ autoCollapseNav: event.target.checked }, event.target.checked ? "Sidebar will collapse in Forms" : "Sidebar will stay open")}/>
          </label>
        </section>

        <section className="settings-card">
          <div className="settings-card-head"><span className="eyebrow">BACKUP</span><h2>Move this workspace</h2></div>
          <p className="settings-note">Your signed-in study is stored securely in Glean and a browser copy supports recovery. Download a backup before major changes. Restoring replaces the current study and then syncs it to your account.</p>
          <div className="settings-actions">
            <button className="outline-button" onClick={onExportWorkspace}><Download size={15}/>Download backup</button>
            <label className="outline-button file-button"><Upload size={15}/>Restore from file<input type="file" accept="application/json,.json" onChange={event => { onImportWorkspace(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }}/></label>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head"><span className="eyebrow">SHORTCUTS</span><h2>Keyboard</h2></div>
          <dl className="shortcut-list">
            <div><dt><kbd>⌘</kbd><kbd>K</kbd></dt><dd>Search findings, interviews and areas from the top bar</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>Close search, a dialog, or the evidence drawer</dd></div>
          </dl>
        </section>

        <section className="settings-card danger-card">
          <div className="settings-card-head"><span className="eyebrow">DATA</span><h2>Export or clear this workspace</h2></div>
          <p className="settings-note">This workspace holds {study.interviews.length} {study.interviews.length === 1 ? "interview" : "interviews"}, {study.themes.length} {study.themes.length === 1 ? "finding" : "findings"} and {evidenceCount} {evidenceCount === 1 ? "quote" : "quotes"}. Export before you clear it — starting a new study cannot be undone.</p>
          <div className="settings-actions">
            <button className="outline-button" onClick={onExportCsv}><Download size={15}/>Evidence CSV</button>
            <button className="outline-button" onClick={onExportWord}><FileText size={15}/>Word report</button>
            <button className="danger-button" onClick={onReset}><Trash2 size={15}/>Start a new study</button>
          </div>
        </section>
      </div>

      <aside className="settings-side">
        <section>
          <span className="eyebrow">WHERE YOUR DATA LIVES</span>
          <h2>This browser, this account</h2>
          <p>Interviews, findings and preferences are stored locally under your account key. Signing out leaves them in place; another account on this machine starts with an empty workspace.</p>
        </section>
        <section>
          <span className="eyebrow">NOT YET REAL</span>
          <h2>Prototype limits</h2>
          <p>Redaction and exact-quote enforcement are recorded here but not yet applied by the analysis step. Study chat matches on this device rather than retrieving from a server.</p>
        </section>
      </aside>
    </div>
  </section>;
}

const HELP_TOPICS = [
  {
    id: "start",
    icon: Sprout,
    question: "How do I run a study from start to finish?",
    answer: "Add five to twenty interview transcripts, run analysis to group them into findings, approve the findings the quotes actually support, then open the report. The three steps in the sidebar follow that order and show how far along you are."
  },
  {
    id: "interviews",
    icon: MessageSquareText,
    question: "What can I upload as an interview?",
    answer: "Paste a transcript, or drop in a TXT, DOCX or PDF. Each becomes one participant. Analysis needs the words people used, so a summary or a notes doc will produce weaker findings than a real transcript."
  },
  {
    id: "findings",
    icon: Lightbulb,
    question: "Why does every finding show quotes?",
    answer: "A finding is a claim about what participants said, and a claim you cannot check is not worth putting in a report. Open any finding to see the passages behind it, and approve only the ones the evidence supports. Rejecting a finding keeps it out of the report."
  },
  {
    id: "forms",
    icon: ClipboardList,
    question: "How do research forms work?",
    answer: "Import a research plan or describe your goal, audience and decision, and Glean drafts sections and questions you can edit. Publishing gives you a link that shows respondents only the form — never your builder, drafts or review notes. Publishing again updates the same form and keeps the responses you already have."
  },
  {
    id: "report",
    icon: FileText,
    question: "What ends up in the exported report?",
    answer: "Approved findings, their quotes and the participant codes attached to them. Raw transcripts are never included. You can export the evidence as CSV, the report as a Word document, or print to PDF."
  },
  {
    id: "privacy",
    icon: LockKeyhole,
    question: "Where is my research stored?",
    answer: "In this browser, under the account you signed in with. It is not uploaded for analysis in this prototype, and it is not visible to anyone who opens a published form link."
  },
  {
    id: "chat",
    icon: Bot,
    question: "Why does Ask Glean refuse some questions?",
    answer: "It answers only from your interviews and findings. When a question does not overlap anything participants said, it says so rather than guessing — a confident answer with no evidence behind it is the failure mode worth avoiding."
  }
] as const;

function HelpView({ onForms, onInterviews, onSettings }: { onForms: () => void; onInterviews: () => void; onSettings: () => void }) {
  const [query, setQuery] = useState("");
  const [openTopic, setOpenTopic] = useState<string | null>(HELP_TOPICS[0].id);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? HELP_TOPICS.filter(topic => `${topic.question} ${topic.answer}`.toLowerCase().includes(needle))
    : HELP_TOPICS;

  return <section className="help-view page-pad">
    <div className="research-header">
      <div>
        <span className="eyebrow">HELP</span>
        <h1>How Glean works.</h1>
        <p>Short answers to the questions that come up while running a study. Everything here describes what the app does today, not what is planned.</p>
      </div>
      <label className="search-field compact">
        <Search size={17}/>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search help" aria-label="Search help"/>
      </label>
    </div>

    <div className="help-grid">
      <div className="help-main">
        {matches.length === 0
          ? <div className="empty-search"><Search size={26}/><h3>Nothing matches “{query}”</h3><p>Try a word from the question you have, like “quotes”, “form”, or “export”.</p></div>
          : matches.map(topic => {
              const Icon = topic.icon;
              const open = openTopic === topic.id;
              return <article key={topic.id} className={`help-topic ${open ? "open" : ""}`}>
                <button aria-expanded={open} onClick={() => setOpenTopic(open ? null : topic.id)}>
                  <span className="help-topic-icon"><Icon size={18}/></span>
                  <b>{topic.question}</b>
                  <ChevronDown size={18} aria-hidden="true"/>
                </button>
                {open && <p>{topic.answer}</p>}
              </article>;
            })}
      </div>

      <aside className="help-side">
        <section>
          <span className="eyebrow">JUMP BACK IN</span>
          <h2>Common next steps</h2>
          <button className="text-button" onClick={onInterviews}><Upload size={15}/>Add interviews</button>
          <button className="text-button" onClick={onForms}><ClipboardList size={15}/>Create a form</button>
          <button className="text-button" onClick={onSettings}><Settings size={15}/>Open settings</button>
        </section>
        <section>
          <span className="eyebrow">STILL STUCK</span>
          <h2>Ask a person</h2>
          <p>Glean is an early prototype and some paths are not built yet. If something looks broken rather than unfinished, send the study title and what you expected to happen.</p>
          <a className="outline-button" href="mailto:hello@folde.studio?subject=Glean%20feedback"><SendHorizontal size={15}/>Email the team</a>
        </section>
      </aside>
    </div>
  </section>;
}

function JourneyLine({ number, title, text, complete }: { number: string; title: string; text: string; complete: boolean }) {
  return <div className="journey-line"><span>{complete ? <Check size={17}/> : number}</span><div><b>{title}</b><small>{text}</small></div></div>;
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
