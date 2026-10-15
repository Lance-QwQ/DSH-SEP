import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,link} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const {runIsolated}=await import('./linux-isolation.mjs').catch(()=>({}));
const base=resolve(process.env.SEP_PORTABLE_ROOT),work=resolve(process.env.SEP_BUNDLE_TEST_ROOT);
const bwrap=join(base,'sandbox-runtime/usr/bin/bwrap');
const binarySha256=process.env.SEP_BWRAP_SHA256;
async function fixture(){const root=await mkdtemp(join(work,'isolation-'));const source=join(root,'source'),scratch=join(root,'scratch');await mkdir(source,{mode:0o700});await mkdir(scratch,{mode:0o700});await writeFile(join(source,'data.txt'),'original');return {source,scratch};}
async function invoke(f,code,extra={}){
 assert.equal(typeof runIsolated,'function');
 return runIsolated({bwrap,binarySha256,source:f.source,scratch:f.scratch,command:['/usr/bin/python3','-c',code],timeoutMs:3000,...extra});
}
test('sandbox can write its private workspace while real source is read-only',async()=>{
 const f=await fixture(),result=await invoke(f,'import errno\nopen("/work/result.txt","w").write("candidate")\ntry:\n open("/source/data.txt","w").write("bad")\n raise Exception("source writable")\nexcept OSError as e:\n assert e.errno==errno.EROFS\n');
 assert.equal(result.code,0,result.stderr);assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');assert.equal(await readFile(join(f.scratch,'result.txt'),'utf8'),'candidate');
});
test('rename, unlink, hard links and symlink dereference cannot mutate the read-only source',async()=>{
 const f=await fixture(),result=await invoke(f,'import os,errno\nfor op in [lambda:os.unlink("/source/data.txt"),lambda:os.rename("/source/data.txt","/source/moved"),lambda:os.link("/source/data.txt","/work/link")]:\n try:\n  op();raise Exception("mutation permitted")\n except OSError as e:\n  assert e.errno in [errno.EROFS,errno.EXDEV]\nos.symlink("/source/data.txt","/work/escape")\ntry:\n open("/work/escape","w").write("bad");raise Exception("symlink write permitted")\nexcept OSError as e:\n assert e.errno==errno.EROFS\n');
 assert.equal(result.code,0,result.stderr);assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
});
test('host files and credentials are hidden, network is isolated and privileges cannot be regained',async()=>{
 const f=await fixture(),result=await invoke(f,'import os,socket,subprocess\nassert not os.path.exists("/opt/dsh-sep-cross-platform")\nassert not os.path.exists("/home/sep-rc")\nassert "DEEPSEEK_API_KEY" not in os.environ\ns=open("/proc/self/status").read()\nassert "NoNewPrivs:\\t1" in s\nassert "CapEff:\\t0000000000000000" in s\nr=subprocess.run(["/usr/bin/unshare","--user","--map-root-user","/usr/bin/true"],capture_output=True)\nassert r.returncode!=0\nr=subprocess.run(["/usr/bin/mount","-o","remount,rw","/source"],capture_output=True)\nassert r.returncode!=0\ntry:\n socket.create_connection(("1.1.1.1",443),.2);raise Exception("network reachable")\nexcept OSError:pass\n');
 assert.equal(result.code,0,result.stderr);
});
test('deadline kills the exact sandbox and its delayed writer before returning',{timeout:6000},async()=>{
 const f=await fixture(),result=await invoke(f,'import subprocess,time\nsubprocess.Popen(["/usr/bin/python3","-c","import time;time.sleep(1);open(\\\"/work/late.txt\\\",\\\"w\\\").write(\\\"late\\\")"])\nprint("STARTED",flush=True)\ntime.sleep(10)\n',{timeoutMs:300});
 assert.equal(result.reason,'timeout');assert.equal(result.exited,true);assert.match(result.stdout,/STARTED/);
 await new Promise(resolve=>setTimeout(resolve,1200));await assert.rejects(readFile(join(f.scratch,'late.txt')),{code:'ENOENT'});
});
test('untrusted sandbox binary identity refuses before command dispatch',async()=>{
 const f=await fixture();await assert.rejects(invoke(f,'open("/work/bad","w").write("bad")',{binarySha256:'0'.repeat(64)}),{code:'SEP_LINUX_SANDBOX_IDENTITY'});await assert.rejects(readFile(join(f.scratch,'bad')),{code:'ENOENT'});
});
test('preexisting workspace hard link cannot bypass the read-only source mount',async()=>{
 const f=await fixture();await link(join(f.source,'data.txt'),join(f.scratch,'alias'));
 await assert.rejects(invoke(f,'open("/work/alias","w").write("bad")'),{code:'SEP_LINUX_SANDBOX_WORKSPACE_NOT_EMPTY'});
 assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
});
test('bounded output stops only the owned sandbox and returns after exit',async()=>{
 const f=await fixture(),result=await invoke(f,'import sys\nwhile True:sys.stdout.write("x"*4096);sys.stdout.flush()\n');
 assert.equal(result.reason,'output-limit');assert.equal(result.exited,true);assert(Buffer.byteLength(result.stdout+result.stderr)<=65536);
});
