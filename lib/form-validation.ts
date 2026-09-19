import { z } from "zod";

export const sectionsSchema = z.array(z.object({
  id: z.string().min(1).max(100), title: z.string().trim().min(1).max(200),
  questions: z.array(z.object({
    id: z.string().min(1).max(100), text: z.string().trim().min(1).max(2000),
    type: z.enum(["open", "single", "scale"]),
    options: z.array(z.string().trim().min(1).max(500)).max(100),
    consent: z.boolean().optional(),
    logic: z.object({ option: z.string().max(500).optional(), targetSectionId: z.string().max(100).optional() }).optional()
  })).max(200)
})).min(1).max(50).superRefine((sections, ctx) => {
  const ids = new Set<string>();
  for (const [index, section] of sections.entries()) {
    if (ids.has(section.id)) ctx.addIssue({ code: "custom", message: "Section IDs must be unique" });
    ids.add(section.id);
    for (const q of section.questions) {
      if (ids.has(q.id)) ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
      ids.add(q.id);
      if (q.type !== "open" && (q.options.length < 2 || new Set(q.options).size !== q.options.length)) ctx.addIssue({ code: "custom", message: "Choices need at least two distinct options" });
      if (q.logic?.targetSectionId && !sections.slice(index + 1).some(s => s.id === q.logic?.targetSectionId)) ctx.addIssue({ code: "custom", message: "Branching must point to a later section" });
      if (q.logic?.option && !q.options.includes(q.logic.option)) ctx.addIssue({ code: "custom", message: "Branch answer must match an option" });
    }
  }
});

export const formSaveSchema = z.object({
  formId: z.string().uuid().optional(), version: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  sections: sectionsSchema,
  context: z.object({ goal: z.string().max(10000), audience: z.string().max(2000), decision: z.string().max(10000) }).optional(),
  publish: z.boolean().default(false), expiresDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7)
});

export function validateAnswers(sections: z.infer<typeof sectionsSchema>, answers: Record<string, string>) {
  const questions = sections.flatMap(s => s.questions);
  if (!Object.values(answers).some(a => a.trim())) throw new Error("Please answer at least one question.");
  for (const [id, answer] of Object.entries(answers)) {
    const q = questions.find(q => q.id === id);
    if (!q) throw new Error("The form has changed. Reload it before submitting.");
    if (answer.length > 10000) throw new Error("An answer is too long. Please shorten it.");
    if (answer && q.type !== "open" && !q.options.includes(answer)) throw new Error("Please choose one of the available answers.");
  }
  for (const q of questions.filter(q => q.consent)) {
    if (!answers[q.id]?.trim() || /^(no|i do not consent|i don't consent|decline)$/i.test(answers[q.id])) throw new Error("Consent is required before answers can be recorded.");
  }
}
