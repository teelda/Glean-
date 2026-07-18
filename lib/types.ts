export type Strength = "emerging" | "recurring" | "dominant";
export type ThemeStatus = "draft" | "approved" | "rejected";

export interface Participant {
  id: string;
  code: string;
  role: string;
  segment: string;
  accent: string;
}

export interface Evidence {
  id: string;
  interviewId: string;
  participantCode: string;
  participantRole: string;
  quote: string;
  context: string;
  segmentId: string;
}

export interface Theme {
  id: string;
  title: string;
  summary: string;
  strength: Strength;
  participantCount: number;
  evidence: Evidence[];
  status: ThemeStatus;
  tags: string[];
  x: number;
  y: number;
}

export interface Interview {
  id: string;
  participant: Participant;
  title: string;
  date: string;
  source: "paste" | "txt" | "docx" | "pdf";
  wordCount: number;
  status: "ready" | "processing" | "needs-review";
  transcript: string;
  summary: string;
}

export interface Study {
  id: string;
  title: string;
  goal: string;
  context: string;
  targetUsers: string;
  questions: string[];
  hypotheses: string;
  status: "draft" | "analysed" | "stale";
  interviews: Interview[];
  themes: Theme[];
  updatedAt: string;
}
