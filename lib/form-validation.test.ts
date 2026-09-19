import { describe, it, expect } from "vitest";
import { sectionsSchema, validateAnswers } from "./form-validation";
const sections = [{ id: "section", title: "Consent", questions: [{ id: "q1", text: "Consent?", type: "single" as const, options: ["Yes", "No"], consent: true }] }];
describe("respondent boundaries", () => {
  it("retains consent when validating a publish request", () => { expect(sectionsSchema.parse(sections)[0].questions[0].consent).toBe(true); });
  it("rejects missing and declined consent even if the browser is bypassed", () => {
    expect(() => validateAnswers(sections, {})).toThrow();
    expect(() => validateAnswers(sections, { q1: "No" })).toThrow(/Consent/);
  });
  it("rejects forged answer IDs and invalid choices", () => {
    expect(() => validateAnswers(sections, { q1: "Maybe" })).toThrow(/available/);
    expect(() => validateAnswers(sections, { q1: "Yes", forged: "value" })).toThrow(/changed/);
  });
  it("accepts a consented response", () => { expect(() => validateAnswers(sections, { q1: "Yes" })).not.toThrow(); });
  it("rejects duplicate question IDs and backwards branches", () => {
    expect(sectionsSchema.safeParse([{ ...sections[0], questions: [...sections[0].questions, ...sections[0].questions] }]).success).toBe(false);
    expect(sectionsSchema.safeParse([{ ...sections[0], questions: [{ ...sections[0].questions[0], logic: { targetSectionId: "section" } }] }]).success).toBe(false);
  });
});
