import {hash,fail} from './project-tree.mjs';
// The repository keeps the rc.2 companion; the frozen Alpha.2 package already
// contains this three-site workingDirectory API migration. Neither is replaced.
export const contextDerivation=Object.freeze({source:'bundle/host/context-preparation/index.mjs',sourceSha256:'110c74099985b81caf70a285ecd9662a8f7ae0cf8902437ceb131fcbb4ceff29',old:'session.header.cwd',replacement:"ctx.get('workingDirectory').get(session)",occurrences:3,resultSha256:'32364edece8f70a972d784c051b6da256c2ab3cb074232be078fec551928a1de'});
export function alpha2ContextSource(source){
 const digest=hash(source);if(digest===contextDerivation.resultSha256)return source;
 if(digest!==contextDerivation.sourceSha256||source.split(contextDerivation.old).length!==contextDerivation.occurrences+1)fail('SEP_LINUX_CONTEXT_ORIGIN_CHANGED');
 const result=source.replaceAll(contextDerivation.old,contextDerivation.replacement);if(hash(result)!==contextDerivation.resultSha256)fail('SEP_LINUX_CONTEXT_TRANSFORM');return result;
}
