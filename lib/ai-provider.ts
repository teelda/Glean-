import { z } from "zod";

export const FindingSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(10),
  evidenceSegmentIds: z.array(z.string()).min(1),
  tags: z.array(z.enum(["Need", "Pain point", "Behaviour", "Opportunity", "Mental model"])),
});

export interface AIProvider {
  generateStructured<T>(input: { system: string; prompt: string; schema: z.ZodType<T> }): Promise<T>;
  embed(texts: string[]): Promise<number[][]>;
  transcribe?(media: ArrayBuffer): Promise<Array<{ speaker: string; text: string; startMs: number; endMs: number }>>;
}

export class DemoAIProvider implements AIProvider {
  async generateStructured<T>(): Promise<T> {
    throw new Error("The demo UI uses its included evidence-backed sample. Configure a production AI adapter to analyse new studies.");
  }
  async embed(texts: string[]) { return texts.map(() => []); }
}
