import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type BackendQuestion = {
  id: string;
  text: string;
  type: "open" | "single" | "scale";
  options: string[];
  logic?: { option?: string; targetSectionId?: string };
  consent?: boolean;
};

export type BackendSection = { id: string; title: string; questions: BackendQuestion[] };
export type BackendForm = {
  id: string;
  ownerId?: string;
  slug: string;
  name: string;
  sections: BackendSection[];
  status: "draft" | "published";
  token?: string;
  createdAt: string;
  updatedAt: string;
};
export type BackendResponse = {
  id: string;
  formId: string;
  answers: Record<string, string>;
  createdAt: string;
};

/** A form as handed to a respondent: no token, no internal status. */
export type PublicForm = Pick<BackendForm, "id" | "slug" | "name" | "sections">;

type LocalStore = { forms: BackendForm[]; responses: (BackendResponse & { token: string })[] };

const storePath = path.join(process.cwd(), "tmp", "form-backend.json");

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * The JSON file store exists so the form flow is testable without credentials.
 * It cannot work on a serverless host — the filesystem is read-only or reset
 * between invocations — so refuse it in production rather than dropping
 * responses on the floor.
 */
function assertLocalStoreUsable() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Form storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then redeploy — responses cannot be saved without them."
    );
  }
}

async function readStore(): Promise<LocalStore> {
  try {
    return JSON.parse(await fs.readFile(storePath, "utf8")) as LocalStore;
  } catch {
    return { forms: [], responses: [] };
  }
}

async function writeStore(store: LocalStore) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
}

export function backendMode() {
  return supabaseAdmin() ? "supabase" : "local-dev";
}

export function createPublicToken() {
  return randomBytes(18).toString("base64url");
}

const toPublicForm = (form: BackendForm): PublicForm => ({
  id: form.id,
  slug: form.slug,
  name: form.name,
  sections: form.sections
});

/**
 * Create or update a form owned by `ownerId`.
 *
 * The client here is the service-role client, which bypasses row-level
 * security — so migration 002's "owners manage research forms" policy does NOT
 * protect this path. Ownership is enforced in the query instead: the update is
 * scoped by owner_id so a caller cannot overwrite someone else's form by
 * passing its id, and the insert stamps owner_id so no new row is left NULL.
 */
export async function publishForm(input: { name: string; slug: string; sections: BackendSection[]; formId?: string; ownerId: string }) {
  const now = new Date().toISOString();
  const supabase = supabaseAdmin();

  // Re-publishing an existing form updates it in place. Without this every
  // press of Publish minted a new form and split responses across the copies.
  if (supabase) {
    if (input.formId) {
      const { data, error } = await supabase
        .from("research_forms")
        .update({ name: input.name, slug: input.slug, sections: input.sections, status: "published", updated_at: now })
        .eq("id", input.formId)
        .eq("owner_id", input.ownerId)
        .select("id, slug, name, sections, status, public_token, created_at, updated_at")
        .single();
      if (!error && data) return mapSupabaseForm(data);
      // No row matched: either the id does not exist or it belongs to someone
      // else. Falling through to insert would mint a copy, so refuse instead.
      throw new Error("That form could not be updated.");
    }
    const { data, error } = await supabase
      .from("research_forms")
      .insert({ owner_id: input.ownerId, name: input.name, slug: input.slug, sections: input.sections, status: "published", public_token: createPublicToken() })
      .select("id, slug, name, sections, status, public_token, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return mapSupabaseForm(data);
  }

  assertLocalStoreUsable();
  const store = await readStore();
  const existing = input.formId
    ? store.forms.find(form => form.id === input.formId && form.ownerId === input.ownerId)
    : undefined;
  if (input.formId && !existing) throw new Error("That form could not be updated.");
  if (existing) {
    existing.name = input.name;
    existing.slug = input.slug;
    existing.sections = input.sections;
    existing.status = "published";
    existing.updatedAt = now;
    await writeStore(store);
    return existing;
  }
  const form: BackendForm = {
    id: randomUUID(),
    ownerId: input.ownerId,
    slug: input.slug,
    name: input.name,
    sections: input.sections,
    status: "published",
    token: createPublicToken(),
    createdAt: now,
    updatedAt: now
  };
  store.forms.unshift(form);
  await writeStore(store);
  return form;
}

/** Internal lookup — the returned form still carries its token. */
async function findFormByToken(token: string) {
  if (!token) return null;
  const supabase = supabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from("research_forms")
      .select("id, slug, name, sections, status, public_token, created_at, updated_at")
      .eq("public_token", token)
      .eq("status", "published")
      .single();
    if (error || !data) return null;
    return mapSupabaseForm(data);
  }
  assertLocalStoreUsable();
  const store = await readStore();
  return store.forms.find(form => form.token === token && form.status === "published") ?? null;
}

export async function getPublicForm(token: string): Promise<PublicForm | null> {
  const form = await findFormByToken(token);
  return form ? toPublicForm(form) : null;
}

export async function submitResponse(token: string, answers: Record<string, string>) {
  const form = await findFormByToken(token);
  if (!form) return null;
  const now = new Date().toISOString();
  const supabase = supabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("form_responses")
      .insert({ form_id: form.id, public_token: token, answers })
      .select("id, form_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, formId: data.form_id, answers, createdAt: data.created_at } satisfies BackendResponse;
  }

  assertLocalStoreUsable();
  const store = await readStore();
  const response = { id: randomUUID(), formId: form.id, token, answers, createdAt: now };
  store.responses.unshift(response);
  await writeStore(store);
  return { id: response.id, formId: response.formId, answers, createdAt: response.createdAt } satisfies BackendResponse;
}

/**
 * Responses for one form.
 *
 * `formId` is required: the previous signature treated it as optional and
 * returned every response in the database when it was omitted. Responses never
 * carry the form's public token — that token is the credential that grants
 * read and submit access, and it must not travel in a listing.
 *
 * `ownerId` is required for the same class of reason. A form id is not a
 * secret — it is handed to the browser on publish — so scoping by form alone
 * let any caller read another researcher's respondent answers by supplying an
 * id. The service-role client bypasses RLS, so this check has to happen here.
 */
export async function listResponses(formId: string, ownerId: string): Promise<BackendResponse[]> {
  if (!formId) throw new Error("A form id is required to list responses.");
  if (!ownerId) throw new Error("An owner is required to list responses.");
  const supabase = supabaseAdmin();
  if (supabase) {
    const { data: owned } = await supabase
      .from("research_forms")
      .select("id")
      .eq("id", formId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    // Not yours (or not a real form): answer as if it has no responses rather
    // than confirming the id exists.
    if (!owned) return [];

    const { data, error } = await supabase
      .from("form_responses")
      .select("id, form_id, answers, created_at")
      .eq("form_id", formId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(item => ({
      id: item.id,
      formId: item.form_id,
      answers: item.answers,
      createdAt: item.created_at
    } satisfies BackendResponse));
  }

  assertLocalStoreUsable();
  const store = await readStore();
  if (!store.forms.some(form => form.id === formId && form.ownerId === ownerId)) return [];
  return store.responses
    .filter(response => response.formId === formId)
    .map(({ id, formId: form, answers, createdAt }) => ({ id, formId: form, answers, createdAt } satisfies BackendResponse));
}

function mapSupabaseForm(data: {
  id: string; owner_id?: string | null; slug: string; name: string; sections: BackendSection[] | null;
  status: BackendForm["status"]; public_token: string | null; created_at: string; updated_at: string;
}): BackendForm {
  return {
    id: data.id,
    ownerId: data.owner_id ?? undefined,
    slug: data.slug,
    name: data.name,
    sections: data.sections ?? [],
    status: data.status,
    token: data.public_token ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}
