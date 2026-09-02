// Research-document import and context-drafting.
//
// Pure functions: text in, form drafts out. Kept out of the view layer so the
// heuristics can be tested directly — see lib/form-import.test.ts.

export type FormLogic = { option?: string; targetSectionId?: string };
export type FormQuestion = {
  id: string;
  text: string;
  type: "open" | "single" | "scale";
  options: string[];
  logic?: FormLogic;
  /** Gates submission: a "No" here stops the response being recorded. */
  consent?: boolean;
};
export type FormSection = { id: string; title: string; questions: FormQuestion[] };
export type FormDraft = {
  id: string;
  name: string;
  goal?: string;
  purpose: string;
  audience: string;
  status: "Draft" | "Needs review" | "Approved" | "Published";
  sections: FormSection[];
  source: string;
};


export function segmentResearchDoc(text: string, fileName: string): FormDraft[] {
  const cleaned = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const lines = reconstructImportedLines(cleaned.split(/\n+/).map(line => line.trim()).filter(Boolean));
  const details = extractResearchDocDetails(lines, fileName);
  const questions = collectImportedQuestions(lines).slice(0, 80);
  if (!questions.length || !details.sections.some(section => section.questions.length)) return [];
  const pool = questions;
  const groups = groupQuestionsByPurpose(pool);
  const source = fileName.replace(/\.[^.]+$/, "");
  const fullImport: FormDraft = {
    id: `draft-full-${Date.now()}`,
    name: `${details.title} form`,
    goal: details.goal,
    purpose: details.decision,
    audience: details.audience,
    status: "Needs review",
    source,
    sections: details.sections.map((section, sectionIndex) => ({
        id: `import-section-${sectionIndex}`,
        title: section.title,
        questions: section.questions.map((question, questionIndex) => buildImportedQuestion(`import-q-${sectionIndex}-${questionIndex}`, question))
      }))
  };

  const groupedDrafts: FormDraft[] = groups.map((group, index) => ({
    id: `draft-${Date.now()}-${index}`,
    name: `${group.title} form`,
    goal: details.goal,
    purpose: group.purpose,
    audience: group.audience,
    status: index === 0 ? "Needs review" : "Draft",
    source,
    sections: [
      {
        id: `section-${index}-questions`,
        title: group.title,
        questions: group.questions.map((question, questionIndex) => buildImportedQuestion(`q-${index}-${questionIndex}`, question))
      }
    ]
  }));

  return [fullImport];
}

/**
 * Optional: partition an imported draft into focused forms by question purpose.
 * Kept out of the import path — an import should return the document that was
 * uploaded, not four keyword-bucketed subsets presented as finished forms.
 */
export function splitDraftByPurpose(draft: FormDraft): FormDraft[] {
  const questions = draft.sections.flatMap(section => section.questions.map(question => question.text));
  return groupQuestionsByPurpose(questions).map((group, index) => ({
    id: `draft-split-${Date.now()}-${index}`,
    name: `${group.title} form`,
    goal: draft.goal,
    purpose: group.purpose,
    audience: group.audience,
    status: "Draft" as const,
    source: draft.source,
    sections: [{
      id: `split-section-${index}`,
      title: group.title,
      questions: group.questions.map((question, questionIndex) => buildImportedQuestion(`split-q-${index}-${questionIndex}`, question))
    }]
  }));
}

export function extractResearchDocDetails(lines: string[], fileName: string) {
  const source = cleanTitle(titleCase(fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")));
  const firstHeading = lines.find(line => !isQuestionLine(line) && !/^(goal|objective|audience|participants|decision|purpose|context)\s*:/i.test(line) && line.length <= 90);
  const title = cleanTitle(titleCase((firstHeading ?? source).replace(/\b(form|questionnaire|survey)\b/gi, "").trim() || source));
  const goal = findMetadata(lines, /(goal|objective|aim|learn|context)\s*:\s*(.+)/i) ?? `Review and refine the questions imported from ${source}.`;
  const audience = findMetadata(lines, /(audience|participants|respondents|target users?)\s*:\s*(.+)/i) ?? "Participants described in the uploaded research document";
  const decision = findMetadata(lines, /(decision|purpose|use this to|inform)\s*:\s*(.+)/i) ?? "Decide what to ask, validate, or analyse from the uploaded research document.";
  const sections: { title: string; questions: string[] }[] = [];
  let current = { title: "Imported questions", questions: [] as string[] };

  lines.forEach((line, index) => {
    const cleanedLine = normalizeImportedLine(line);
    if (!cleanedLine || /^(goal|objective|audience|participants|decision|purpose|context)\s*:/i.test(cleanedLine)) return;
    if (isFollowUpFragment(cleanedLine) && current.questions.length) {
      current.questions[current.questions.length - 1] = mergeFollowUp(current.questions[current.questions.length - 1], cleanedLine);
      return;
    }
    const splitQuestions = splitImportedQuestionBlock(cleanedLine);
    if (splitQuestions.length) {
      current.questions.push(...splitQuestions);
      return;
    }
    const nextLooksLikeQuestion = lines.slice(index + 1, index + 4).map(normalizeImportedLine).some(isQuestionCandidate);
    if (nextLooksLikeQuestion && cleanedLine.length <= 90) {
      if (current.questions.length) sections.push(current);
      current = { title: titleCase(cleanedLine), questions: [] };
    }
  });
  if (current.questions.length) sections.push(current);

  return {
    title,
    goal,
    audience,
    decision,
    sections: sections.length ? sections : [{ title: "Imported questions", questions: collectImportedQuestions(lines).slice(0, 80) }].filter(section => section.questions.length)
  };
}

export function findMetadata(lines: string[], pattern: RegExp) {
  const match = lines.map(line => line.match(pattern)?.[2]?.trim()).find(Boolean);
  return match && match.length > 2 ? match : null;
}

export function cleanTitle(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.。:;,\-–—]+$/g, "").trim();
}

export function deriveResearchSubject({ formName, researchGoal, audience, decision }: { formName: string; researchGoal: string; audience: string; decision: string }) {
  const combined = cleanTitle(`${researchGoal} ${audience} ${decision}`);
  const fallback = cleanTitle(formName.replace(/\b(form|research|survey|study)\b/gi, ""));
  if (/\b(period|menstrual|pads?|tampons?|cycle)\b/i.test(combined)) return "period care products";
  if (/\b(wellness|health|medical|symptom|treatment)\b/i.test(combined)) return "wellness products or services";
  if (/\b(onboarding|signup|sign up|activation)\b/i.test(combined)) return "the onboarding experience";
  if (/\b(price|pricing|subscription|checkout|payment)\b/i.test(combined)) return "pricing and purchase decisions";
  if (/\b(community|creator|content|brand)\b/i.test(combined)) return "this brand experience";
  if (/\b(app|software|platform|tool|dashboard|workflow)\b/i.test(combined)) return "this product experience";
  if (fallback.split(/\s+/).length > 5) return "this product area";
  return fallback || "this topic";
}

export function isQuestionLine(line: string) {
  const cleaned = normalizeImportedLine(line);
  return cleaned.length > 8 && (cleaned.endsWith("?") || /^(what|why|how|when|where|which|do you|have you|tell me|describe|rate|choose|select|share|list)/i.test(cleaned));
}

export function normalizeImportedLine(line: string) {
  return line
    .replace(/^[-•*\d.)\s]+/, "")
    .replace(/^q\d+[.)\s-]*/i, "")
    .replace(/^[→>]\s*/g, "")
    .replace(/\s*\[(open|single choice|multiple choice|rating|scale|long answer|short answer)\]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function reconstructImportedLines(lines: string[]) {
  const result: string[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer.trim()) result.push(buffer.trim());
    buffer = "";
  };

  lines.forEach(rawLine => {
    const line = normalizeImportedLine(rawLine);
    if (!line) return;
    const isMeta = /^(goal|objective|audience|participants|decision|purpose|context)\s*:/i.test(line);
    const isHeading = !isMeta && !isQuestionStart(line) && !line.endsWith("?") && line.length <= 90;
    const startsQuestion = isQuestionStart(line);

    if (isMeta || isHeading) {
      flush();
      result.push(line);
      return;
    }

    if (!buffer && startsQuestion && !line.endsWith("?")) {
      buffer = line;
      return;
    }

    if (buffer) {
      if (startsQuestion && !isFollowUpFragment(line)) {
        flush();
        if (line.endsWith("?")) result.push(line);
        else buffer = line;
        return;
      }
      buffer = `${buffer} ${line}`.replace(/\s+/g, " ").trim();
      if (line.endsWith("?")) flush();
      return;
    }

    result.push(line);
  });

  flush();
  return result;
}

export function collectImportedQuestions(lines: string[]) {
  const questions: string[] = [];
  lines.forEach(line => {
    const cleaned = normalizeImportedLine(line);
    if (!cleaned || /^(goal|objective|audience|participants|decision|purpose|context)\s*:/i.test(cleaned)) return;
    if (isFollowUpFragment(cleaned) && questions.length) {
      questions[questions.length - 1] = mergeFollowUp(questions[questions.length - 1], cleaned);
      return;
    }
    questions.push(...splitImportedQuestionBlock(cleaned));
  });
  return questions.filter((line, index, all) => all.findIndex(item => item.toLowerCase() === line.toLowerCase()) === index);
}

export function splitImportedQuestionBlock(line: string) {
  const cleaned = normalizeImportedLine(stripResearcherNotes(line));
  if (!cleaned || shouldSkipImportedLine(cleaned)) return [];
  const protectedText = cleaned.replace(/\b(?:e\.g|i\.e|vs)\./gi, match => match.replace(".", "<DOT>"));
  const parts = protectedText
    .split(/(?<=[?])\s+/g)
    .map(part => normalizeImportedLine(part.replace(/<DOT>/g, ".")))
    .filter(Boolean);
  const questions: string[] = [];
  parts.forEach(part => {
    if (isResearcherInstruction(part)) return;
    const questionSentences = part.match(/(?:[^?]*\?)/g)?.map(item => normalizeImportedLine(item)) ?? [];
    if (questionSentences.length > 1) {
      questions.push(...questionSentences.filter(isQuestionCandidate));
      return;
    }
    if (isQuestionCandidate(part)) questions.push(part);
  });
  return questions.filter((question, index, all) => all.findIndex(item => item.toLowerCase() === question.toLowerCase()) === index);
}

export function stripResearcherNotes(line: string) {
  return line
    .replace(/\bThis is the story behind\b.*?\bfounding insight[.?!]?/gi, " ")
    .replace(/\bThis is the story behind[^.?!]*[.?!]/gi, " ")
    .replace(/\bCollect these stories[^.?!]*[.?!]/gi, " ")
    .replace(/\bThe best ones become[^.?!]*[.?!]/gi, " ")
    .replace(/\bUse this (?:to|for)[^.?!]*[.?!]/gi, " ")
    .replace(/\bThis question (?:is|should|will)[^.?!]*[.?!]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isResearcherInstruction(line: string) {
  return /\b(brand content|founding insight|collect these|with permission|researcher|internal note|do not show|analyse this|use this)\b/i.test(line) && !line.includes("?");
}

export function isFollowUpFragment(line: string) {
  const cleaned = line.trim();
  return /^(follow\s*up|probe|ask next|if yes|if no|why or why not|why\/why not|what would make it|tell me more)\b/i.test(cleaned);
}

export function mergeFollowUp(question: string, followUp: string) {
  const cleaned = followUp.replace(/^follow\s*up\s*(with)?:\s*/i, "").trim();
  if (!cleaned || question.toLowerCase().includes(cleaned.toLowerCase())) return question;
  return `${question} Follow-up: ${cleaned}`;
}

export function isQuestionCandidate(line: string) {
  const cleaned = normalizeImportedLine(line);
  if (cleaned.length < 10 || shouldSkipImportedLine(cleaned)) return false;
  if (cleaned.endsWith("?")) return true;
  return isQuestionStart(cleaned);
}

export function isQuestionStart(line: string) {
  return /^(what|why|how|when|where|which|do you|does|have you|would you|tell(?: me| us)?|describe|rate|choose|select|share|list|at what price)\b/i.test(line.trim());
}

export function shouldSkipImportedLine(line: string) {
  const cleaned = line.trim();
  if (/·/.test(cleaned)) return true;
  if (/^(whatsapp|phone call|voice note|async|live)$/i.test(cleaned)) return true;
  if (/^(whatsapp|phone call|voice note)\b/i.test(cleaned) && !cleaned.endsWith("?")) return true;
  if (/\b(guide|framework|research plan|questions|analysis framework|why we are doing this research)\b/i.test(cleaned) && !cleaned.endsWith("?")) return true;
  if (/^(screening|screener|consent|introduction|background|objectives?|methodology|analysis|community)$/i.test(cleaned)) return true;
  if (/^[A-Z][A-Za-z\s&-]{2,42}$/.test(cleaned) && !/^(what|how|when|where|which|do|does|have|would|at)\b/i.test(cleaned)) return true;
  return false;
}

export function buildContextFormDraft({ formName, researchGoal, audience, decision }: { formName: string; researchGoal: string; audience: string; decision: string }): FormDraft {
  const topic = deriveResearchSubject({ formName, researchGoal, audience, decision });
  const rawGoal = researchGoal.trim();
  const rawDecision = decision.trim();
  const goalHint = !rawGoal || /^define the decision/i.test(rawGoal) ? `Understand people's needs, pain points, behaviours, and expectations around ${topic}.` : rawGoal;
  const decisionHint = !rawDecision || /^what decision/i.test(rawDecision) ? "Decide what to build, improve, position, or validate next." : rawDecision;
  const context = `${topic} ${goalHint} ${decisionHint}`;
  const hasPricing = /\b(price|pricing|cost|afford|pay|willingness)\b/i.test(context);
  const hasIngredients = /\b(organic|natural|ingredient|plastic|microplastic|irritat|material|locally|manufactur|import)\b/i.test(context);
  const hasProduct = /\b(product|app|service|tool|platform|brand|pads?|care|solution)\b/i.test(context);
  const hasSensitive = /\b(health|wellness|period|sexual|money|finance|income|identity|privacy|medical|personal)\b/i.test(context);
  const relationshipOptions = hasProduct
    ? ["Use something similar now", "Used something similar before", "Actively looking for a better option", "Curious but not actively looking", "Not relevant to me"]
    : ["Directly experience this", "Support someone who experiences this", "Work in this area", "Curious but not directly affected", "Not relevant to me"];
  const frequencyOptions = ["Daily", "Weekly", "Monthly", "A few times a year", "Rarely", "Only in specific situations"];
  const decisionQuestions: FormQuestion[] = [
    { id: "context-decision-q1", text: "When comparing available options, what matters most to you and why?", type: "open", options: [] },
    { id: "context-decision-q2", text: "What would make you trust a new option enough to try it?", type: "open", options: [] },
    { id: "context-decision-q3", text: "What would make you hesitate, ignore it, or stop using it after trying it?", type: "open", options: [] },
    hasPricing
      ? { id: "context-decision-q4", text: "What price range would feel fair, and what would make it feel too expensive?", type: "open", options: [] }
      : { id: "context-decision-q4", text: "How important is solving this problem to you right now?", type: "scale", options: ["1", "2", "3", "4", "5"] },
    hasIngredients
      ? { id: "context-decision-q5", text: "How much do ingredients, materials, sourcing, or where it is made affect your choice?", type: "open", options: [] }
      : { id: "context-decision-q5", text: "If you had to trade off quality, convenience, price, trust, and speed, what would you prioritise?", type: "open", options: [] }
  ];
  return {
    id: `draft-context-${Date.now()}`,
    name: formName.trim() || "Research form",
    purpose: decisionHint,
    audience: audience.trim() || "Target research participants",
    status: "Draft",
    source: "Generated from context",
    sections: [
      {
        id: "context-consent",
        title: "Consent and fit",
        questions: [
          { id: "context-consent-q1", text: "Do you consent to your anonymised response being used for this research?", type: "single", options: ["Yes", "No"], consent: true },
          { id: "context-consent-q2", text: `Which best describes your relationship to ${topic}?`, type: "single", options: relationshipOptions },
          { id: "context-consent-q3", text: "How recently have you experienced or thought about this?", type: "single", options: ["Today or this week", "In the last month", "In the last 3 months", "Longer ago", "I have not experienced it"] }
        ]
      },
      {
        id: "context-experience",
        title: "Behaviour and current experience",
        questions: [
          { id: "context-exp-q1", text: `What are you currently using, doing, or relying on for ${topic}?`, type: "open", options: [] },
          { id: "context-exp-q2", text: "Think about the last real time this came up. What happened from start to finish?", type: "open", options: [] },
          { id: "context-exp-q3", text: "Where were you, what were you trying to do, and what made that moment easier or harder?", type: "open", options: [] },
          { id: "context-exp-q4", text: "How often does this situation come up for you?", type: "single", options: frequencyOptions }
        ]
      },
      {
        id: "context-pain",
        title: "Pain points and unmet needs",
        questions: [
          { id: "context-pain-q1", text: "What feels frustrating, uncomfortable, risky, confusing, or missing in your current experience?", type: "open", options: [] },
          { id: "context-pain-q2", text: "What have you already tried, and what made those options work or fall short?", type: "open", options: [] },
          { id: "context-pain-q3", text: "What do you currently do as a workaround when the available options do not fully solve it?", type: "open", options: [] },
          { id: "context-pain-q4", text: "How serious does this problem feel when it happens?", type: "scale", options: ["1", "2", "3", "4", "5"] },
          { id: "context-pain-q5", text: "If this was solved well, what would noticeably change in your day, routine, confidence, or outcome?", type: "open", options: [] }
        ]
      },
      {
        id: "context-decision",
        title: "Decision drivers",
        questions: decisionQuestions
      },
      {
        id: "context-followup",
        title: "Language and follow-up",
        questions: [
          { id: "context-followup-q1", text: "What words would you naturally use to describe this problem to a friend?", type: "open", options: [] },
          { id: "context-followup-q2", text: "What would you search for, ask for, or say out loud if you were looking for a better option?", type: "open", options: [] },
          { id: "context-followup-q3", text: "Is there anything else we should understand about your experience?", type: "open", options: [] },
          { id: "context-followup-q4", text: hasSensitive ? "Would you be open to a private follow-up conversation about your response?" : "Would you be open to a short follow-up conversation about your response?", type: "single", options: ["Yes", "Maybe", "No"] }
        ]
      }
    ]
  };
}

export function removeContextEchoQuestions(sections: FormSection[], formName: string) {
  const topic = deriveResearchSubject({ formName, researchGoal: "", audience: "", decision: "" });
  return sections.map(section => ({
    ...section,
    questions: section.questions.map(question => {
      if (/^Thinking about this goal/i.test(question.text)) {
        return { ...question, text: `What are you currently using or doing when it comes to ${topic}?` };
      }
      if (/^What should the team know before making this decision/i.test(question.text)) {
        return { ...question, text: "What would make you choose one option over another?" };
      }
      return question;
    })
  }));
}

export function isLegacyContextValue(field: "formName" | "researchGoal" | "audience" | "decision", value: string) {
  const cleaned = value.trim().toLowerCase();
  const legacy: Record<typeof field, string[]> = {
    formName: ["customer pain point research form"],
    researchGoal: ["define the decision this research should inform."],
    audience: ["target research participants for this study"],
    decision: ["what decision this research should support"]
  };
  return legacy[field].includes(cleaned);
}

export function groupQuestionsByPurpose(questions: string[]) {
  const buckets = [
    { title: "Pain point discovery", purpose: "Understand the problems, anxieties, blockers, and unmet needs people keep repeating.", audience: "People who experience or recently explored this problem", match: /(pain|problem|frustrat|difficult|challenge|block|missing|struggle|worry|concern)/i, questions: [] as string[] },
    { title: "Trust and decision drivers", purpose: "Learn what creates confidence, credibility, safety, and willingness to act.", audience: "Potential customers, users, or community members", match: /(trust|safe|confidence|choose|buy|recommend|credible|privacy|decision)/i, questions: [] as string[] },
    { title: "Behaviour and context", purpose: "Capture routines, current workarounds, usage moments, and real-life context.", audience: "Participants with relevant lived or product experience", match: /(currently|usually|routine|when|where|how often|tried|use|experience|today)/i, questions: [] as string[] },
    { title: "Brand and positioning", purpose: "Understand language, expectations, emotional tone, and what the brand should stand for.", audience: "Target audience, buyers, or stakeholders", match: /(brand|feel|language|message|content|community|identity|describe|words)/i, questions: [] as string[] }
  ];
  questions.forEach(question => {
    const bucket = buckets.find(item => item.match.test(question)) ?? buckets[buckets.length - 1];
    bucket.questions.push(question);
  });
  return buckets
    .map(bucket => ({ ...bucket, questions: bucket.questions }))
    .filter(bucket => bucket.questions.length)
    .slice(0, 5);
}

export function inferQuestionType(question: string): FormQuestion["type"] {
  if (/\b(rate|rating|scale)\b|how comfortable|how likely|from 1|\b1\s*(?:-|–|to)\s*(?:5|7|10)\b/i.test(question)) return "scale";
  if (/^how often\b|frequency/i.test(question.trim())) return "single";
  if (/^(which|choose|select|do you|have you|would you)\b|yes or no/i.test(question.trim())) return "single";
  return "open";
}

export function buildImportedQuestion(id: string, question: string): FormQuestion {
  const type = inferQuestionType(question);
  return { id, text: question, type, options: importedQuestionOptions(question, type) };
}

export function importedQuestionOptions(question: string, type: FormQuestion["type"]) {
  if (type === "scale") {
    const range = question.match(/1\s*(?:to|-)\s*(10|7|5)/i)?.[1];
    const max = range ? Number(range) : 5;
    return Array.from({ length: max }, (_, index) => String(index + 1));
  }
  if (type !== "single") return [];
  if (/relationship|describe yourself|best describes/i.test(question)) return ["Current user", "Past user", "Exploring options", "New to this area", "Prefer not to say"];
  if (/how often|frequency/i.test(question)) return ["Daily", "Weekly", "Monthly", "Rarely", "It depends"];
  if (/consent|agree|permission/i.test(question)) return ["Yes", "No"];
  return ["Yes", "No", "Not sure"];
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "research-form";
}

export function encodeFormDraftForUrl(payload: { name: string; sections: FormSection[] }) {
  if (typeof window === "undefined") return "";
  try {
    const json = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

export function titleCase(value: string) {
  return value.replace(/\w\S*/g, part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}
