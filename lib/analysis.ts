import type { Evidence, Strength, Theme } from "./types";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;

export interface RedactionResult {
  redacted: string;
  redactions: Array<{ kind: "email" | "phone"; value: string; start: number; end: number }>;
}

export function redactObviousPii(input: string): RedactionResult {
  const matches: RedactionResult["redactions"] = [];
  for (const [kind, regex] of [["email", EMAIL], ["phone", PHONE]] as const) {
    regex.lastIndex = 0;
    for (const match of input.matchAll(regex)) {
      matches.push({ kind, value: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  let cursor = 0;
  let redacted = "";
  for (const item of matches.filter((m, i, all) => i === 0 || m.start >= all[i - 1].end)) {
    redacted += input.slice(cursor, item.start) + `[REDACTED ${item.kind.toUpperCase()}]`;
    cursor = item.end;
  }
  return { redacted: redacted + input.slice(cursor), redactions: matches };
}

export function strengthForCoverage(participantCount: number, totalParticipants: number): Strength {
  if (participantCount <= 1) return "emerging";
  if (participantCount >= 3 && participantCount / Math.max(totalParticipants, 1) >= 0.5) return "dominant";
  return "recurring";
}

export function evidenceIsVerbatim(evidence: Evidence, transcript: string): boolean {
  const normalize = (value: string) => value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  return normalize(transcript).includes(normalize(evidence.quote));
}

export function validateTheme(theme: Theme, transcripts: Map<string, string>): { valid: boolean; invalidEvidenceIds: string[] } {
  const invalidEvidenceIds = theme.evidence
    .filter(evidence => !transcripts.has(evidence.interviewId) || !evidenceIsVerbatim(evidence, transcripts.get(evidence.interviewId) ?? ""))
    .map(evidence => evidence.id);
  return { valid: theme.evidence.length > 0 && invalidEvidenceIds.length === 0, invalidEvidenceIds };
}
