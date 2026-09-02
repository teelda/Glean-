import { describe, expect, it } from "vitest";
import {
  buildContextFormDraft,
  collectImportedQuestions,
  inferQuestionType,
  reconstructImportedLines,
  segmentResearchDoc,
  shouldSkipImportedLine,
  slugify,
  splitDraftByPurpose,
  splitImportedQuestionBlock
} from "./form-import";

const guide = `Feminine Wellness Discovery Guide

Goal: Understand how women choose period care products.
Audience: Women aged 18-35 in Lagos
Decision: Which product line to launch first.

Screening
1. Which best describes your relationship to period care products?
2. How often do you buy pads or tampons?

Experience
3. Tell me about the last time you shopped for period care. What happened?
   Follow up: why or why not?
4. What frustrates you about the products available today?

Pricing
5. What price range would feel fair for a monthly subscription?
This is the story behind our founding insight. Collect these stories with permission.`;

const linesOf = (text: string) =>
  reconstructImportedLines(text.split(/\n+/).map(line => line.trim()).filter(Boolean));

describe("splitImportedQuestionBlock", () => {
  it("keeps a multi-sentence question whole", () => {
    // An over-split question is silent corruption a researcher cannot spot in a
    // 60-question import; an under-split one is fixed with one edit.
    expect(splitImportedQuestionBlock("Tell me about the last time you shopped. What happened?"))
      .toEqual(["Tell me about the last time you shopped. What happened?"]);
  });

  it("still splits two questions that each end in a question mark", () => {
    expect(splitImportedQuestionBlock("What did you try? Why did it fall short?"))
      .toEqual(["What did you try?", "Why did it fall short?"]);
  });

  it("drops researcher instructions that are not questions", () => {
    expect(splitImportedQuestionBlock("Collect these stories with permission.")).toEqual([]);
  });
});

describe("collectImportedQuestions", () => {
  it("merges a follow-up fragment into the question above it", () => {
    const questions = collectImportedQuestions(linesOf(guide));
    expect(questions.some(q => q.includes("Follow-up: why or why not"))).toBe(true);
  });

  it("does not emit metadata lines as questions", () => {
    const questions = collectImportedQuestions(linesOf(guide));
    expect(questions.some(q => /^(goal|audience|decision)\b/i.test(q))).toBe(false);
  });

  it("deduplicates repeated questions", () => {
    const repeated = ["What frustrates you?", "What frustrates you?", "What frustrates you?"];
    expect(collectImportedQuestions(repeated)).toHaveLength(1);
  });
});

describe("segmentResearchDoc", () => {
  const drafts = segmentResearchDoc(guide, "wellness-guide.txt");
  const full = drafts[0];
  const questionCount = (draft: typeof full) =>
    draft.sections.reduce((total, section) => total + section.questions.length, 0);

  it("returns a full import first", () => {
    expect(full.status).toBe("Needs review");
    expect(full.source).toBe("wellness-guide");
  });

  it("lifts goal, audience and decision out of the metadata lines", () => {
    expect(full.goal).toMatch(/how women choose period care/i);
    expect(full.audience).toMatch(/Lagos/);
    expect(full.purpose).toMatch(/product line/i);
  });

  it("recovers the document's own section headings", () => {
    expect(full.sections.map(section => section.title)).toEqual(["Screening", "Experience", "Pricing"]);
  });

  it("keeps the multi-sentence question intact end to end", () => {
    const all = full.sections.flatMap(section => section.questions.map(q => q.text));
    expect(all).toContain("Tell me about the last time you shopped for period care. What happened? Follow-up: why or why not?");
  });

  it("returns the uploaded document as a single draft, not keyword-split copies", () => {
    expect(drafts).toHaveLength(1);
  });

  it("splits into focused forms only when asked, without losing questions", () => {
    const split = splitDraftByPurpose(full);
    expect(split.length).toBeGreaterThan(0);
    expect(split.reduce((total, draft) => total + questionCount(draft), 0)).toBe(questionCount(full));
  });

  it("returns nothing for a document with no questions in it", () => {
    expect(segmentResearchDoc("Quarterly revenue summary.\nHeadcount grew.", "notes.txt")).toEqual([]);
  });
});

describe("shouldSkipImportedLine", () => {
  it.each(["Screening", "Consent", "Analysis framework", "WhatsApp"])("skips the boilerplate heading %s", line => {
    expect(shouldSkipImportedLine(line)).toBe(true);
  });

  it("keeps a real question that happens to be short", () => {
    expect(shouldSkipImportedLine("What would you change?")).toBe(false);
  });
});

describe("inferQuestionType", () => {
  it.each([
    ["Rate how important this is from 1 to 5", "scale"],
    ["How often do you buy pads?", "single"],
    ["Which best describes you?", "single"],
    ["What frustrates you most?", "open"]
  ])("types %s as %s", (question, expected) => {
    expect(inferQuestionType(question)).toBe(expected);
  });
});

describe("buildContextFormDraft", () => {
  const draft = buildContextFormDraft({
    formName: "Period care discovery",
    researchGoal: "Understand how people choose pads",
    audience: "Women 18-35",
    decision: "Which line to launch"
  });

  it("opens with consent", () => {
    expect(draft.sections[0].questions[0].text).toMatch(/consent/i);
  });

  it("names the derived subject in the questions rather than echoing the goal", () => {
    const text = draft.sections.flatMap(s => s.questions.map(q => q.text)).join(" ");
    expect(text).toContain("period care products");
    expect(text).not.toContain("Understand how people choose pads");
  });

  it("gives every option-based question at least two options", () => {
    draft.sections.flatMap(s => s.questions)
      .filter(q => q.type !== "open")
      .forEach(q => expect(q.options.length).toBeGreaterThan(1));
  });
});

describe("slugify", () => {
  it.each([
    ["Period Care Discovery", "period-care-discovery"],
    ["  --Trailing--  ", "trailing"],
    ["", "research-form"],
    ["!!!", "research-form"]
  ])("turns %s into %s", (input, expected) => expect(slugify(input)).toBe(expected));
});
