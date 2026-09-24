import fs from 'node:fs/promises';
import path from 'node:path';
for(const tree of ['overlay','test-runtime']){
 const file=path.join(import.meta.dirname,'core',tree,'p0501/src/p2/control.js');let text=await fs.readFile(file,'utf8');
 const begin="  let ownership,closed=false,tail=Promise.resolve();";
 if(!text.includes(begin))throw Error('source drift');
 text=text.replace(begin,"  let matchedPrior=false;\n"+begin)
 .replace("if(await exists(guardPath)||recoverLockToken&&mode!=='maintenance')fail('P2_LOCKED');","if(await exists(guardPath)||recoverLockToken&&(mode!=='maintenance'||!await exists(lockPath)))fail('P2_LOCKED');")
 .replace('validatePrior:prior=>typeof prior.token', 'validatePrior:prior=>(matchedPrior=typeof prior.token')
 .replace("(!recoverLockToken||prior.token===recoverLockToken)});","(!recoverLockToken||prior.token===recoverLockToken))});")
 .replace("if(await exists(guardPath)){await ownership.release();fail('P2_LOCKED');}","if(await exists(guardPath)||recoverLockToken&&!matchedPrior){await ownership.release();fail('P2_LOCKED');}");
 await fs.writeFile(file,text);
}
