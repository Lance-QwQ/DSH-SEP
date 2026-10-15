// Test-only fresh process; no application launcher, model or external tool.
import {createRequire} from 'node:module';
import {realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const {SessionId,KNOWN_SESSION_EVENT_TYPES}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')));
const Provider=(await import(pathToFileURL(join(root,'bundle/lib/session-persistence.js')))).default;
const {foldTasks}=await import(pathToFileURL(join(root,'bundle/modules/task-checkpoint/lib/fold.js')));
const ctx=new Context();
try{
  await ctx.plugin(Provider,{root:process.argv[2],compression:'none'});
  const handle=await ctx.sessionPersistence.open(SessionId(process.argv[3]),'read');
  try{
    const result=await handle.read(),task=[...foldTasks(result.events).values()][0];
    process.stdout.write(JSON.stringify({eventCount:result.events.length,taskOwner:task.sessionId,required:!Object.hasOwn(result.events[0],'ignorable'),nativeVocabularyChanged:KNOWN_SESSION_EVENT_TYPES.has('task/checkpoint-change')}));
  }finally{await handle.close();}
}finally{await ctx.fiber.dispose();}
