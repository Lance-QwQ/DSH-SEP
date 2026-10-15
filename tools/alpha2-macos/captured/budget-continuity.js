import {readdir,readFile} from 'node:fs/promises';
import {dirname,basename} from 'node:path';
import {fail} from './errors.js';

/** Persistent evidence that this path has already participated in accounting.
 * Read-only: never creates or repairs a mutex, ledger or checkpoint. */
export async function hasBudgetHistory(path){
 const normalize=name=>process.platform==='win32'?name.toLowerCase():name;
 const name=normalize(basename(path));let entries;
 try{entries=await readdir(dirname(path));}catch(error){if(error.code==='ENOENT')return false;throw error;}
 return entries.map(normalize).some(entry=>entry===name+'.lock'||entry.startsWith(name+'.lock.')
  ||entry.startsWith(name+'.')&&(entry.endsWith('.checkpoint')||entry.endsWith('.tmp')));
}
export function missingLedger(){fail('BUDGET_LEDGER_MISSING','The established budget ledger is missing. No spending or settings were reset. Restore the verified current ledger through controlled recovery before retrying; do not delete its coordination files or create an empty replacement.');}

/** Recheck the actual input before atomic publication. The writer mutex covers
 * cooperating writers; an observed external move/replacement must not be erased. */
export async function assertLedgerUnchanged(path,expected){
 let current;try{current=await readFile(path);}catch(error){
  if(error.code!=='ENOENT')throw error;
  if(expected===null)return;
  missingLedger();
 }
 if(expected===null||!current.equals(expected))fail('BUDGET_LEDGER_CHANGED','The budget ledger changed outside the owned transaction. No replacement was published; controlled inspection is required.');
}