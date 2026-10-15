// Exact synthetic subprocess cut points. Never receives user paths or bodies.
import {readFile} from 'node:fs/promises';
import {applyAttachmentPurge} from './linux-attachment-maintenance.mjs';
const [file,phase]=process.argv.slice(2),plan=JSON.parse(await readFile(file));
await applyAttachmentPurge({storageRoot:plan.storageRoot,projectId:plan.projectId,plan,confirm:plan.planHash,onEvent:event=>{if(event===phase)process.kill(process.pid,'SIGKILL');}});
throw Error('requested cut point was not reached');
