import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const {boot,loadProfileDirectory}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')));
const [directory,anchor,file,result]=process.argv.slice(2);
const profile=loadProfileDirectory('dsh',directory,anchor);let ctx;
try{ctx=await boot('dsh',file,profile.layers.flatMap(l=>l.patches));const value=ctx.sepBundleInstallation;await ctx.fiber.dispose();ctx=undefined;await writeFile(result,JSON.stringify(value)+'\n');}finally{await ctx?.fiber.dispose();}
