import {createHash} from 'node:crypto';
export const LIMITS=Object.freeze({frameBytes:4096,maxPending:8,maxReplyBytes:524288,pageBytes:2048,retainedReplies:2});
export const fail=code=>{throw Object.assign(Error(code),{code});};
export const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const opaque=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,128}$/.test(value);
export function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('\0')!==[...keys].sort().join('\0'))fail('SEP_PROJECT_UI_INPUT');}
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function checkBinding(value){exact(value,['nonce','programSha256','ownerGeneration']);if(!digest(value.nonce)||!digest(value.programSha256)||!opaque(value.ownerGeneration))fail('SEP_PROJECT_UI_BINDING');return Object.freeze({...value});}
export function checkDocument(value){exact(value,['windowId','documentGeneration']);if(!Number.isSafeInteger(value.windowId)||value.windowId<1||!opaque(value.documentGeneration))fail('SEP_PROJECT_UI_DOCUMENT');return value;}
export const operations=Object.freeze(['status','plans','select','review','discard','restore','recover','generations','cancel']);
export const safeCode=e=>/^(?:SEP|FS)_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_PROJECT_UI_FAILED';
