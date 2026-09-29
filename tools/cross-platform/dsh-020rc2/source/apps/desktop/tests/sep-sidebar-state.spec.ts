import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {EventEmitter} from 'node:events'
vi.mock('../src/sep-update/update-review.mjs',()=>({reviewCandidate:vi.fn(async()=>({report:{readiness:'candidate-missing'}}))}))
import type { MessageBoxOptions } from 'electron'
import type { ManagedUpdateState } from '../src/sep-update/update-desktop.mjs'
import {createManagedUpdater} from '../src/sep-update/update-desktop.mjs'
const active: ReturnType<typeof createManagedUpdater>[]=[]
afterEach(()=>{for(const service of active.splice(0))service.close()})
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'sep-sidebar-'))
 await mkdir(join(root,'node_modules/dsh-system-enhancement-package'),{recursive:true})
 await writeFile(join(root,'node_modules/dsh-system-enhancement-package/package.json'),JSON.stringify({version:'0.2.0-beta.3'}))
 let mode='available'
 const body=JSON.stringify({schema:1,product:'dsh-sep',platform:process.platform+'-'+process.arch,sepVersion:'0.2.0-beta.4',hostVersion:'0.1.7-rc.2',bundle:{name:'sep.zip',sha256:'a'.repeat(64),url:'https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.0-beta.4/sep.zip'}})
 const rows=[{tag_name:'v0.2.0-beta.4',draft:false,html_url:'https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.0-beta.4',published_at:'2026-09-28T00:00:00Z',assets:[{id:1,name:'dsh-sep-update.json',digest:'sha256:'+createHash('sha256').update(body).digest('hex'),browser_download_url:'https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.0-beta.4/dsh-sep-update.json'}]}]
 const sep:any[]=[],host:any[]=[],dialogs:any[]=[]
 const service=createManagedUpdater({app:{getPath:()=>root,getVersion:()=> '0.1.7-rc.2'} as any,dialog:{async showMessageBox(options: MessageBoxOptions){dialogs.push(options);return {response:1,checkboxChecked:false}}},BrowserWindow:class {} as any,powerMonitor:new EventEmitter() as any,projectDir:root,profileContext:{home:null,installAnchor:root,overlayFiles:[]},onState:(s: ManagedUpdateState)=>host.push(s),onSepState:(s: ManagedUpdateState)=>sep.push(s),fetcher:async(url:string)=>{if(mode==='failure')throw Error('OFFLINE');return new Response(url.includes('/releases/assets/')?body:JSON.stringify(url.includes('deepseek-ai/')?[]:mode==='empty'?[]:rows))}} as any)
 active.push(service)
 return {service,sep,host,dialogs,root,setMode:(value:string)=>mode=value}
}
it('publishes SEP discovery separately and retains it when the user defers',async()=>{
 const f=await fixture();await f.service.checkSep()
 expect(f.sep.map(s=>s.phase)).toEqual(['checking','available','candidate-unavailable'])
 expect(f.sep.at(-1).version).toBe('0.2.0-beta.4')
 expect(f.host).toEqual([])
 await f.service.check()
 expect(f.host.at(-1).phase).toBe('idle')
 expect(f.service.sepStatus().version).toBe('0.2.0-beta.4')
 expect(JSON.parse(await readFile(join(f.root,'sep-updates/sep-check-state.json'),'utf8')).release.sepVersion).toBe('0.2.0-beta.4')
})
it('exposes an actionable SEP error without changing the host status',async()=>{
 const f=await fixture();f.setMode('failure');await f.service.checkSep()
 expect(f.sep.at(-1)).toMatchObject({phase:'error',failedOperation:'check'})
 expect(f.host).toEqual([])
})
it('clears stale availability and reports insufficient metadata as a check failure',async()=>{
 const f=await fixture();await f.service.checkSep();f.setMode('empty');await f.service.checkSep()
 expect(f.service.sepStatus()).toMatchObject({phase:'error',message:'SEP_UPDATE_METADATA_UNAVAILABLE'})
 expect(f.service.sepStatus().version).toBeUndefined()
})
it('does not emit after disposal',async()=>{
 const f=await fixture();f.service.close();await f.service.checkSep();expect(f.sep).toEqual([])
})

