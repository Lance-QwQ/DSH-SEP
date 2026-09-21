import fs from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if(process.argv[2]==='--sleep-child') {setTimeout(()=>{},60000);} else {
  const input=process.argv.at(-1), text=await fs.readFile(input,'utf8');
  const [mode,audit]=text.slice(text.indexOf('FIXTURE:')+8).split('|');
  if(audit) await fs.appendFile(audit,'start:'+mode+'\n');
  if(mode==='tree') {
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--sleep-child'],{stdio:'inherit',windowsHide:true});
    await fs.writeFile(audit+'.pid',String(child.pid));await new Promise(r=>setTimeout(r,60000));
  }
  if(mode.startsWith('sleep')) await new Promise(r=>setTimeout(r,Number(mode.slice(5))));
  if(mode==='flood') for(let i=0;i<10000;i++){process.stdout.write('a'.repeat(200)+'\n');process.stderr.write('b'.repeat(200)+'\n');}
  if(mode==='fail'){process.stderr.write('fixture failure marker\n');process.exitCode=7;} else {
    const outDir=process.argv[process.argv.indexOf('--outdir')+1], output=join(outDir,basename(input,extname(input))+'.pdf');
    if(mode!=='no-output') await fs.writeFile(output,mode==='bad-pdf'?'bad PDF':'%PDF-1.7\n'+(mode==='large'?'x'.repeat(20000):mode)+'\n%%EOF\n');
    if(audit) await fs.appendFile(audit,'end:'+mode+'\n');
  }
}
