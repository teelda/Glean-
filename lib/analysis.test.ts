import { describe, expect, it } from "vitest";
import { evidenceIsVerbatim, redactObviousPii, strengthForCoverage, validateTheme } from "./analysis";
import { sampleStudy } from "./sample-data";

describe("strengthForCoverage", () => {
  it("keeps a single-participant finding emerging", () => expect(strengthForCoverage(1, 5)).toBe("emerging"));
  it("marks repeated minority evidence recurring", () => expect(strengthForCoverage(2, 5)).toBe("recurring"));
  it("requires at least three participants for dominant", () => expect(strengthForCoverage(3, 5)).toBe("dominant"));
});

describe("redactObviousPii", () => {
  it("redacts email and phone while preserving an analysis copy", () => {
    const result = redactObviousPii("Email Ada at ada@example.com or +234 803 123 4567 today.");
    expect(result.redacted).toBe("Email Ada at [REDACTED EMAIL] or [REDACTED PHONE] today.");
    expect(result.redactions).toHaveLength(2);
  });
});

describe("evidence integrity", () => {
  it("accepts a quote that occurs in the transcript", () => {
    const evidence = sampleStudy.themes[0].evidence[0];
    const transcript = sampleStudy.interviews.find(i => i.id === evidence.interviewId)!.transcript;
    expect(evidenceIsVerbatim(evidence, transcript)).toBe(true);
  });

  it("rejects unsupported evidence", () => {
    const theme = { ...sampleStudy.themes[0], evidence: [{ ...sampleStudy.themes[0].evidence[0], quote: "A fabricated quote" }] };
    const transcripts = new Map(sampleStudy.interviews.map(i => [i.id, i.transcript]));
    expect(validateTheme(theme, transcripts)).toEqual({ valid: false, invalidEvidenceIds: ["e1"] });
  });
});
