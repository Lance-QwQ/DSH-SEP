import { z } from 'zod';
import { mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fail } from './errors.js';
const locator = z.object({ lineStart:z.number().int().positive().optional(), lineEnd:z.number().int().positive().optional(), page:z.number().int().positive().optional(), paragraph:z.number().int().positive().optional() }).strict();
const part = z.object({ id:z.string(), text:z.string().max(1200), locator }).strict();
const source = z.object({ path:z.string(), sha256:z.string().length(64), parts:z.array(part), warnings:z.array(z.string()) }).strict();
const automatic=z.object({kind:z.enum(['preference','fact','decision','task']),key:z.string().max(128),evidence:z.string().max(600),messageId:z.string(),expiresAt:z.string(),conflictsWith:z.string().optional(),conflictsRevision:z.number().int().positive().optional(),origin:z.enum(['user-message-extraction','manual-revision'])}).strict();
const revision = z.object({ revision:z.number().int().positive(), text:z.string().max(2000), status:z.enum(['candidate','confirmed','revoked']), updatedAt:z.string(), source:z.object({sessionId:z.string(),callId:z.string(),reason:z.string()}).strict(),automatic:automatic.optional() }).strict();
const memory = revision.extend({ id:z.string(), createdAt:z.string(), history:z.array(revision) }).strict();
const projectSchema = z.object({
  root:z.string(), index:z.object({ generation:z.number().int().positive(), parserVersion:z.string(), indexedAt:z.string(), sources:z.array(source) }).strict().nullable(),
  memories:z.array(memory).max(500), events:z.record(z.string(),z.object({ fingerprint:z.string(), memoryId:z.string() }).strict()),
  workflow:z.object({runs:z.array(z.json()).max(200),reviews:z.array(z.json()).max(200)}).strict().optional(),
  automation:z.object({capture:z.boolean().default(true),recall:z.boolean().default(true),receipts:z.record(z.string(),z.object({status:z.enum(['pending','done','failed','skipped']),at:z.string(),code:z.string().optional()}).strict()).default({})}).strict().optional(),
}).strict();
export const spec = { name:'dsh_enhancement_suite_v1', version:1, tables: { projects:{valueSchema:projectSchema}, media:{valueSchema:z.object({projectKey:z.string(),createdAt:z.number(),value:z.json()}).strict()} } };

export async function openStore(facility, lockDirectory) {
  if (!lockDirectory || !isAbsolute(lockDirectory)) fail('CONFIG','An absolute lockDirectory is required');
  await mkdir(lockDirectory,{recursive:true});
  const lockPath = join(lockDirectory,'dsh-system-enhancement-package-v1.lock');
  let lock;
  try { lock = await open(lockPath,'wx'); } catch (e) { if (e.code === 'EEXIST') fail('DATA_LOCKED','Another instance or an unclean exit owns the data lock'); throw e; }
  let domain;
  try {
    await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));
    await lock.sync();
    domain = await facility.open(spec);
  } catch(e) { await lock.close(); await unlink(lockPath); throw e; }
  const table = domain.table('projects');
  const cache = domain.table('media');
  let tail = Promise.resolve(); let closed = false;
  // Governed storage supplies the one shared queue. A second local queue could
  // wait for a caller blocked on an access lease already held by this caller.
  const schedule=fn=>facility.withAccess?facility.withAccess(fn):tail.then(fn);
  return {
    read(project) { return structuredClone(table.get(project.key) ?? {root:project.root,index:null,memories:[],events:{}}); },
    cached(project,key) { const item=cache.get(`${project.key}_${key}`); return item && item.projectKey===project.key && Date.now()-item.createdAt<300000 ? structuredClone(item.value) : null; },
    cache(project,key,value) {
      if(closed)return Promise.reject(new Error('DISPOSED'));
      const run=schedule(async()=>{
        const entries=[...cache.entries()].filter(([,v])=>v.projectKey===project.key).sort((a,b)=>a[1].createdAt-b[1].createdAt);
        while(entries.length>=32)await cache.delete(entries.shift()[0]);
        await cache.put(`${project.key}_${key}`,{projectKey:project.key,createdAt:Date.now(),value});
      });tail=run.catch(()=>{});return run;
    },
    transaction(project, fn) {
      if (closed) return Promise.reject(new Error('DISPOSED'));
      const run = schedule(async()=>{
        const value = this.read(project); const result = await fn(value);
        projectSchema.parse(value); await table.put(project.key,value); return result;
      });
      tail = run.catch(()=>{}); return run;
    },
    async close() { if(closed)return; closed=true; await tail; await domain.close(); await lock.close(); await unlink(lockPath); },
  };
}
