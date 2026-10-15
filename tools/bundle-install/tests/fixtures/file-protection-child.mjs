import {createRequire} from 'node:module';
import {join,dirname,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [controlRoot,cwd,backup,projectId,mutationId]=process.argv.slice(2);
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const ctx=new Context();
try{
 await ctx.plugin(await import(pathToFileURL(join(root,'bundle/lib/recovery-authority.js'))),{controlRoot});
 const project=await ctx.recoveryHost.projectById({id:projectId});
 await ctx.plugin((await import(pathToFileURL(join(root,'bundle/lib/file-protection.js')))).default,{cwd,projectId,recovery:{root:backup,maxFileBytes:65536,maxTotalBytes:16*1024*1024,maxEntries:128,retentionMs:86400000}});
 const operations=await ctx.fs.listMutations();await ctx.fs.restoreMutation(mutationId);
 console.log(JSON.stringify({operations:operations.length,memoryKey:project.memoryKey,generation:project.generation,restored:true}));
}finally{await ctx.fiber.dispose();}
