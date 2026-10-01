import {z} from 'zod';
import {basename} from 'node:path';
import {fail} from './errors.js';

const pair=z.object({capture:z.boolean(),recall:z.boolean()}).strict();
const id=z.string().min(1).max(4096);
const schemas={
  list:z.object({}).strict(),
  get:z.object({projectId:id}).strict(),
  update:z.object({projectId:id,expected:pair,controls:pair}).strict(),
};
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value)?value:null;

/** Body-free project controls for the native settings transport. No storage schema changes. */
export function createMemorySettingsService({scope,automatic,signal,track=work=>work,runAccess=fn=>fn(),problem}){
  const available=()=>Boolean(scope&&automatic);
  const check=request=>{
    if(signal?.aborted)fail('DISPOSED');
    if(request?.aborted)fail('ABORTED');
  };
  const projectFor=projectId=>{
    if(!available())fail('MEMORY_SETTINGS_UNAVAILABLE');
    const project=scope.projects.find(item=>item.key===projectId);
    if(!project)fail('MEMORY_SETTINGS_PROJECT');
    return project;
  };
  const view=async project=>{
    const saved=await automatic.settings(project,{}),base=automatic.status();
    const controls={capture:saved.capture===true,recall:saved.recall===true};
    const configured={capture:base.capture===true,recall:base.recall===true};
    const effective={capture:controls.capture&&configured.capture,recall:controls.recall&&configured.recall};
    const local=automatic.forProject(project);
    const state=!effective.capture&&!effective.recall?'disabled':local.state==='degraded'?'degraded':local.state==='unavailable'?'unavailable':'ready';
    return {version:1,projectId:project.key,controls,configured,effective,runtime:{state,lastError:safeCode(local.lastError)},scope:'project',transition:'next-operation'};
  };
  const operation=(name,raw,options={})=>{
    const work=Promise.resolve().then(()=>{
      check(options.signal);
      const parsed=schemas[name].safeParse(raw);
      if(!parsed.success)fail('MEMORY_SETTINGS_INPUT');
      return runAccess(async()=>{
        // Access may wait for capture/maintenance. Recheck before touching storage.
        check(options.signal);
        if(name==='list')return {version:1,available:available(),reason:available()?null:safeCode(problem)??'MEMORY_SETTINGS_UNAVAILABLE',projects:available()?scope.projects.map(project=>({id:project.key,label:basename(project.root),root:project.root})):[]};
        const project=projectFor(parsed.data.projectId);
        if(name==='update')await automatic.updateSettings(project,parsed.data.controls,parsed.data.expected,{beforeCommit:()=>check(options.signal)});
        // A successful commit is not undone by a subsequently arriving cancellation.
        return view(project);
      });
    });
    return track(work);
  };
  return {list:(raw={},options)=>operation('list',raw,options),get:(raw,options)=>operation('get',raw,options),update:(raw,options)=>operation('update',raw,options)};
}
