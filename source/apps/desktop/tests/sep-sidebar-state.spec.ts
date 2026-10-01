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
 const legacy={tag_name:'windows-alpha-old',draft:false,html_url:'https://github.com/Lance-QwQ/DSH-SEP/releases/tag/windows-alpha-old',published_at:'2026-09-21T00:00:00Z',assets:[]}
 const olderBody=body.replaceAll('0.2.0-beta.4','0.2.0-beta.2')
 const older={...rows[0],tag_name:'v0.2.0-beta.2',html_url:'https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.0-beta.2',assets:[{...rows[0].assets[0],digest:'sha256:'+createHash('sha256').update(olderBody).digest('hex'),browser_download_url:'https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.0-beta.2/dsh-sep-update.json'}]}
 const releases=()=>mode==='empty'?[]:mode==='legacy'?[legacy]:mode==='partial'?[older,legacy]:mode==='current'?[older]:mode==='available-legacy'?[rows[0],legacy]:rows
 const sep:any[]=[],host:any[]=[],dialogs:any[]=[]
 const service=createManagedUpdater({app:{getPath:()=>root,getVersion:()=> '0.1.7-rc.2'} as any,dialog:{async showMessageBox(options: MessageBoxOptions){dialogs.push(options);return {response:1,checkboxChecked:false}}},BrowserWindow:class {} as any,powerMonitor:new EventEmitter() as any,projectDir:root,profileContext:{home:null,installAnchor:root,overlayFiles:[]},onState:(s: ManagedUpdateState)=>host.push(s),onSepState:(s: ManagedUpdateState)=>sep.push(s),fetcher:async(url:string)=>{if(mode==='failure')throw Error('OFFLINE');return new Response(url.includes('/releases/assets/')?(mode==='partial'||mode==='current'?olderBody:body):JSON.stringify(url.includes('deepseek-ai/')?[]:releases()))}} as any)
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
it('clears stale availability and treats an empty release list as information',async()=>{
 const f=await fixture();await f.service.checkSep();f.setMode('empty');await f.service.checkSep()
 expect(f.service.sepStatus()).toMatchObject({phase:'idle'})
 expect(f.service.sepStatus().version).toBeUndefined()
 expect(f.service.sepStatus().failedOperation).toBeUndefined()
 expect(f.dialogs.at(-1).detail).toContain('SEP_UPDATE_NO_RELEASES')
})
it('does not emit after disposal',async()=>{
 const f=await fixture();f.service.close();await f.service.checkSep();expect(f.sep).toEqual([])
})


it('separates the verified comparison from missing historical manifests',async()=>{
 const f=await fixture();f.setMode('partial');await f.service.checkSep()
 expect(f.service.sepStatus()).toMatchObject({phase:'idle'})
 expect(f.service.sepStatus().failedOperation).toBeUndefined()
 const saved=JSON.parse(await readFile(join(f.root,'sep-updates/sep-check-state.json'),'utf8'))
 expect(saved).toMatchObject({status:'metadata-partial',release:null,coverage:{verifiedManifests:1,matchingPlatforms:1,missingManifests:1,manifestLimitReached:false}})
 expect(f.dialogs.at(-1).message).toBe('已核验的 SEP 清单中未发现更高可用版本')
 expect(f.dialogs.at(-1).detail).toContain('已核验当前平台清单：1 份')
 expect(f.dialogs.at(-1).detail).toContain('1 个发布缺少')
 expect(f.dialogs.at(-1).detail).toContain('不能据此确认所有公开发布均已核验')
 expect(f.dialogs.at(-1)).toEqual(JSON.parse(await readFile(new URL('./expected/sep-metadata-partial.json',import.meta.url),'utf8')))
 expect(f.host).toEqual([])
})
it('treats missing manifests without any comparison as incomplete information',async()=>{
 const f=await fixture();f.setMode('legacy');await f.service.checkSep()
 expect(f.service.sepStatus()).toMatchObject({phase:'idle'})
 expect(f.service.sepStatus().failedOperation).toBeUndefined()
 expect(f.dialogs.at(-1)).toMatchObject({type:'info',message:'SEP 发布信息不足，尚不能比较版本'})
 expect(f.dialogs.at(-1).detail).toContain('SEP_UPDATE_METADATA_UNAVAILABLE')
 expect(f.dialogs.at(-1).detail).not.toContain('已核验的 SEP 清单中未发现')
})
it('retains an eligible update when other historical releases lack manifests',async()=>{
 const f=await fixture();f.setMode('available-legacy');await f.service.checkSep()
 expect(f.service.sepStatus()).toMatchObject({phase:'candidate-unavailable',version:'0.2.0-beta.4'})
 const saved=JSON.parse(await readFile(join(f.root,'sep-updates/sep-check-state.json'),'utf8'))
 expect(saved).toMatchObject({status:'available',coverage:{verifiedManifests:1,missingManifests:1}})
 expect(f.dialogs.at(-1).message).toBe('发现 SEP 本体更新 0.2.0-beta.4')
})
it('reports a complete verified comparison without a historical warning',async()=>{
 const f=await fixture();f.setMode('current');await f.service.checkSep()
 expect(f.service.sepStatus()).toMatchObject({phase:'idle'})
 const saved=JSON.parse(await readFile(join(f.root,'sep-updates/sep-check-state.json'),'utf8'))
 expect(saved).toMatchObject({status:'current',coverage:{verifiedManifests:1,missingManifests:0}})
 expect(f.dialogs.at(-1).message).toBe('已核验的 SEP 清单中未发现更高可用版本')
 expect(f.dialogs.at(-1).detail).not.toContain('SEP_UPDATE_METADATA_UNAVAILABLE')
})
