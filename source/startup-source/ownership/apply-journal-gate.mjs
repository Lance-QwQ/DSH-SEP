import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../core');
const checks = {
 controller: `
  // Prior owner metadata is never permission to mint an empty replacement
  // journal. Validate the durable chain before retiring that prior owner.
  async function priorOwnerJournal() {
    const before=await secureFile(journalPath);
    if(before.size>limits.maxBytes)fail('JOURNAL_LIMIT');
    const raw=await fs.readFile(journalPath),after=await secureFile(journalPath);
    if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||raw.length!==before.size)fail('JOURNAL_CORRUPT');
    if(raw.length&&raw.at(-1)!==10)fail('JOURNAL_CORRUPT');
    const text=raw.toString('utf8');if(!Buffer.from(text).equals(raw))fail('JOURNAL_CORRUPT');
    let priorSeq=0,priorHash='0'.repeat(64);
    for(const line of text.split('\\n').filter(Boolean)) {
      if(Buffer.byteLength(line)+1>limits.maxRecordBytes||priorSeq>=limits.maxRecords)fail('JOURNAL_LIMIT');
      let record;try{record=JSON.parse(line);}catch{fail('JOURNAL_CORRUPT');}
      const {hash,...body}=record;
      if(body.version!==1||body.seq!==priorSeq+1||body.previous!==priorHash||hash!==sha(JSON.stringify(body)))fail('JOURNAL_CORRUPT');
      priorSeq++;priorHash=hash;
    }
  }
  async function prepareOwnerJournal(phase) {
    if(phase!=='intent-durable')return;
    // This callback runs with the native lease held, before owner publication.
    let initial;
    try{initial=await fs.open(journalPath,'wx',0o600);await initial.sync();}
    catch(error){if(error.code!=='EEXIST')throw error;await secureFile(journalPath);}
    finally{await initial?.close();}
  }
`,
 guardian: `
  // A stale owner with missing/corrupt history must not reset generations or
  // the restart budget. The complete durable chain is checked before archive.
  async function priorOwnerJournal() {
    const before=await regular(journalPath);
    if(before.size>MAX_JOURNAL_BYTES)throw fault('GUARDIAN_JOURNAL_INVALID');
    const bytes=await fs.readFile(journalPath),after=await regular(journalPath);
    if(!sameFile(before,after)||before.size!==after.size||before.size!==bytes.length)throw fault('GUARDIAN_JOURNAL_INVALID');
    if(!bytes.length)return;
    if(bytes.at(-1)!==10)throw fault('GUARDIAN_JOURNAL_INVALID');
    const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))throw fault('GUARDIAN_JOURNAL_INVALID');
    let sequence=0,previousHash=null;
    try {
      for(const line of text.trimEnd().split('\\n')) {
        const record=JSON.parse(line),{digest,...payload}=record;
        if(record.sequence!==sequence+1||record.previousHash!==previousHash||hash(JSON.stringify(payload))!==digest||!validState(record.state))throw fault('GUARDIAN_JOURNAL_INVALID');
        sequence=record.sequence;previousHash=digest;
      }
    }catch{throw fault('GUARDIAN_JOURNAL_INVALID');}
  }
  async function prepareOwnerJournal(phase) {
    if(phase!=='intent-durable')return;
    let initial;
    try{initial=await fs.open(journalPath,'wx',0o600);await initial.sync();}
    catch(error){if(error.code!=='EEXIST')throw error;await regular(journalPath);}
    finally{await initial?.close();}
  }
`,
};
for (const base of ['overlay', 'test-runtime']) for (const kind of ['controller', 'guardian']) {
  const file = path.join(root, base, 'p0500/src', kind + '.mjs');
  let text = await fs.readFile(file, 'utf8');
  if (text.includes('async function priorOwnerJournal()')) continue;
  const declaration = kind === 'controller' ? '  let ownership;\n' : '  let ownership,journal;\n';
  if (text.split(declaration).length !== 2) throw Error('DECLARATION_CHANGED ' + file);
  text = text.replace(declaration, checks[kind] + declaration);
  const start = text.indexOf('validatePrior:prior=>');
  const end = text.indexOf('});', start);
  if (start < 0 || end < 0) throw Error('VALIDATOR_CHANGED ' + file);
  const body = text.slice(start + 'validatePrior:prior=>'.length, end);
  text = text.slice(0, start) + 'validatePrior:async prior=>{if(!(' + body + '))return false;await priorOwnerJournal();return true;},onEvent:prepareOwnerJournal' + text.slice(end);
  await fs.writeFile(file, text);
}
console.log(JSON.stringify({ status: 'patched', files: 4 }));
