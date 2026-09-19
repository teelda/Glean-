import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ results: [] as { data: unknown; error: unknown }[], writes: 0 }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => {
  const chain: Record<string, unknown> = {};
  for (const key of ["select", "eq", "update", "insert"]) chain[key] = () => { if (key === "update" || key === "insert") mock.writes++; return chain; };
  chain.maybeSingle = async () => mock.results.shift();
  return chain;
} }) }));
vi.mock("./auth", () => ({ UnauthorizedError: class extends Error {} }));
import { formAccess, saveForm, canEdit, canReadResponses } from "./form-workspace";
const form = { id: "form", owner_id: "owner", version: 3, status: "draft" };
const input = { formId: "form", version: 3, name: "Name", slug: "name", sections: [{id:"s",title:"Section",questions:[]}], publish:false, expiresDays:7 as const };
beforeEach(() => { mock.results = []; mock.writes = 0; vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.invalid"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test"); });
describe("form authorisation", () => {
  it("denies a non-member without writing", async () => {
    mock.results.push({data:form,error:null},{data:null,error:null});
    await expect(formAccess("form","stranger")).rejects.toMatchObject({status:404}); expect(mock.writes).toBe(0);
  });
  it("allows an editor to read responses but not a reviewer", () => {
    expect(canEdit("editor")).toBe(true); expect(canEdit("viewer")).toBe(false);
    expect(canReadResponses("reviewer")).toBe(false); expect(canReadResponses("viewer")).toBe(true);
  });
  it("denies publishing by an editor", async () => {
    mock.results.push({data:form,error:null},{data:{role:"editor"},error:null});
    await expect(saveForm({...input,publish:true},"editor")).rejects.toMatchObject({status:403}); expect(mock.writes).toBe(0);
  });
  it("denies a stale save before any write", async () => {
    mock.results.push({data:form,error:null});
    await expect(saveForm({...input,version:2},"owner")).rejects.toMatchObject({status:409}); expect(mock.writes).toBe(0);
  });
  it("detects an atomic update race", async () => {
    mock.results.push({data:form,error:null},{data:null,error:null});
    await expect(saveForm(input,"owner")).rejects.toMatchObject({status:409});
  });
});
