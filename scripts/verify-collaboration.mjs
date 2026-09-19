import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const base = process.env.TEST_APP_URL || 'http://localhost:3222';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const users = [];
const forms = [];
const suffix = randomBytes(10).toString('hex');
async function account(label) {
  const email = `glean-test-${label}-${suffix}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error); users.push(data.user.id);
  const jar = new Map();
  const client = createServerClient(url, key, { cookies: { getAll: () => [...jar].map(([name,value]) => ({ name,value })), setAll: values => values.forEach(c => jar.set(c.name,c.value)) } });
  const result = await client.auth.signInWithPassword({ email, password }); assert.ifError(result.error);
  return { id: data.user.id, email, client, cookie: [...jar].map(([name,value]) => `${name}=${value}`).join('; ') };
}
async function api(user, path, method = 'GET', payload, status = 200) {
  const r = await fetch(`${base}${path}`, { method, headers: { ...(user ? { Cookie: user.cookie } : {}), 'Content-Type':'application/json', Origin: base }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const data = await r.json();
  assert.equal(r.status, status, `${method} ${path.split('?')[0]}: ${JSON.stringify(data)}`);
  return data;
}
try {
  const owner = await account('owner'), teammate = await account('teammate'), stranger = await account('stranger');
  const sections = [{ id:'s1',title:'Research',questions:[{id:'consent',text:'May we use your response?',type:'single',options:['Yes','No'],consent:true},{id:'pain',text:'What was difficult?',type:'open',options:[]}] }];
  let form = (await api(owner,'/api/forms/workspace','POST',{name:'Verification only',slug:'verification-only',sections,context:{goal:'test',audience:'test',decision:'test'}})).form;
  forms.push(form.id);
  await api(stranger,`/api/forms/workspace?formId=${form.id}`,'GET',null,404);
  const strangerRead = await stranger.client.from('research_forms').select('id').eq('id',form.id);
  assert.ifError(strangerRead.error); assert.equal(strangerRead.data.length,0);
  console.log('PASS: unauthorised API and direct database access denied');
  const invitation = randomBytes(24).toString('base64url');
  const invite = await admin.from('form_invitations').insert({form_id:form.id,email:teammate.email,role:'editor',token_hash:createHash('sha256').update(invitation).digest('hex'),expires_at:new Date(Date.now()+600000).toISOString()}); assert.ifError(invite.error);
  await api(stranger,'/api/forms/accept','POST',{token:invitation},403);
  assert.equal((await api(teammate,'/api/forms/accept','POST',{token:invitation})).formId,form.id);
  form=(await api(teammate,'/api/forms/workspace','POST',{formId:form.id,version:form.version,name:'Edited by teammate',slug:form.slug,sections})).form;
  await api(owner,'/api/forms/workspace','POST',{formId:form.id,version:1,name:'Stale save',slug:form.slug,sections},409);
  await api(teammate,'/api/forms/publish','POST',{formId:form.id,version:form.version,name:form.name,slug:form.slug,sections},403);
  console.log('PASS: email-bound acceptance, editor save, stale-save conflict and owner-only publish');
  form=(await api(owner,'/api/forms/publish','POST',{formId:form.id,version:form.version,name:form.name,slug:form.slug,sections})).form;
  let token=form.token;
  assert.ok(token);
  const stored=await admin.from('research_forms').select('public_token,public_token_hash').eq('id',form.id).single(); assert.ifError(stored.error); assert.equal(stored.data.public_token,null); assert.equal(stored.data.public_token_hash,createHash('sha256').update(token).digest('hex'));
  assert.equal((await api(null,`/api/forms/public/${token}`)).form.sections[0].questions[0].consent,true);
  await api(null,`/api/forms/public/${token}/responses`,'POST',{answers:{consent:'No',pain:'test'}},400);
  await api(null,`/api/forms/public/${token}/responses`,'POST',{answers:{consent:'Yes',pain:'A test answer'}});
  const responses=await api(owner,`/api/forms/responses?formId=${form.id}`); assert.equal(responses.total,1);
  assert.equal((await api(owner,`/api/forms/analytics?formId=${form.id}`)).total,1);
  await api(stranger,`/api/forms/responses?formId=${form.id}`,'GET',null,404);
  await api(owner,'/api/forms/workspace','POST',{action:'member-role',formId:form.id,userId:teammate.id,role:'reviewer'});
  await api(teammate,`/api/forms/responses?formId=${form.id}`,'GET',null,403);
  await api(teammate,'/api/forms/workspace','POST',{action:'comment',formId:form.id,body:'Reviewed test form'});
  await api(owner,'/api/forms/workspace','POST',{action:'member-role',formId:form.id,userId:teammate.id,role:'viewer'});
  await api(teammate,`/api/forms/responses?formId=${form.id}`);
  await api(teammate,'/api/forms/workspace','POST',{action:'comment',formId:form.id,body:'Not allowed'},403);
  console.log('PASS: public consent, persisted responses, analytics and role-specific response access');
  form=(await api(owner,'/api/forms/publish','POST',{formId:form.id,version:form.version,name:form.name,slug:form.slug,sections})).form;
  await api(null,`/api/forms/public/${token}`);
  form=(await api(owner,'/api/forms/workspace','POST',{action:'replace-link',formId:form.id,version:form.version})).form;
  await api(null,`/api/forms/public/${token}`,'GET',null,404); token=form.token;
  await api(null,`/api/forms/public/${token}`);
  form=(await api(owner,'/api/forms/workspace','POST',{action:'close',formId:form.id,version:form.version})).form;
  await api(null,`/api/forms/public/${token}`,'GET',null,404);
  await api(owner,'/api/forms/workspace','POST',{action:'remove-member',formId:form.id,userId:teammate.id});
  await api(teammate,`/api/forms/workspace?formId=${form.id}`,'GET',null,404);
  console.log('PASS: republish retains links; replacement, closure and member revocation take effect');
  const study={id:`test-${suffix}`,title:'Integration test',goal:'test',context:'',targetUsers:'',hypotheses:'',questions:[],status:'draft',interviews:[],themes:[],updatedAt:'now'};
  const saved=await api(owner,'/api/studies/current','PUT',{study,revision:null});
  assert.equal((await api(owner,'/api/studies/current')).study.id,study.id);
  assert.equal((await api(stranger,'/api/studies/current')).study,null);
  await api(owner,'/api/studies/current','PUT',{study,revision:saved.revision});
  await api(owner,'/api/studies/current','PUT',{study,revision:saved.revision},409);
  console.log('PASS: study account isolation and conflict detection');
} finally {
  const failures = [];
  for (const id of users) {
    const existing = await admin.auth.admin.getUserById(id);
    if (existing.error || !existing.data.user.email.endsWith(`-${suffix}@example.invalid`)) {
      failures.push(`Could not verify temporary account ${id}; no deletion attempted`); continue;
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failures.push(`Could not remove temporary account ${id}`);
    else {
      const check = await admin.auth.admin.getUserById(id);
      if (check.data.user || check.error?.status !== 404) failures.push(`Could not verify account removal ${id}`);
    }
  }
  for (const [table, selectColumn, filterColumn, ids] of [
    ['research_forms','id','id',forms], ['form_responses','id','form_id',forms],
    ['form_members','form_id','form_id',forms], ['form_invitations','id','form_id',forms],
    ['form_comments','id','form_id',forms], ['studies','id','owner_id',users],
  ]) {
    if (!ids.length) continue;
    const check = await admin.from(table).select(selectColumn, { count:'exact', head:true }).in(filterColumn,ids);
    if (check.error || check.count !== 0) failures.push(`Cleanup verification failed for ${table}`);
  }
  assert.deepEqual(failures, [], failures.join('; '));
  console.log(`Verified removal of ${users.length} temporary accounts and their forms, responses, memberships, invitations, comments and studies.`);
}
