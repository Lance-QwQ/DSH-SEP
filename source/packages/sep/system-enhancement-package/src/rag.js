import { extname } from 'node:path';
import { parseDocument, PARSER_VERSION, DOCUMENT_EXTENSIONS } from './parsers.js';
import { digest, checkAbort, fail } from './errors.js';
import { rankBm25, selectTokenizer } from './vendor/bm25.js';

export function ragTools(scope,store,{layers}={}) {
  return {
    async index(project,args,exec) {
      return store.transaction(project,async state=>{
        const paths=await scope.files(project,exec.signal);
        const sources=[]; let total=0; let chunks=0; const skipped=[];
        for(const path of paths) {
          const extension=extname(path).toLowerCase();
          if(!DOCUMENT_EXTENSIONS.has(extension)){skipped.push(path);continue;}
          const bytes=await scope.bytes(project,path,exec.signal);
          total+=bytes.length; if(total>32*1024*1024)fail('CORPUS_TOO_LARGE');
          const sha256=digest(bytes);
          const old=state.index?.parserVersion===PARSER_VERSION && state.index.sources.find(s=>s.path===path && s.sha256===sha256);
          if(old){sources.push(old);chunks+=old.parts.length;continue;}
          const parsed=await parseDocument(bytes,extension,{signal:exec.signal});
          const parts=parsed.parts.map((p,i)=>({...p,id:digest(`${path}\0${sha256}\0${i}`)}));
          chunks+=parts.length; if(chunks>5000)fail('TOO_MANY_CHUNKS');
          sources.push({path,sha256,parts,warnings:parsed.warnings});
        }
        checkAbort(exec.signal);
        if(chunks>5000)fail('TOO_MANY_CHUNKS');
        const changed=state.index?.parserVersion!==PARSER_VERSION || JSON.stringify(state.index.sources)!==JSON.stringify(sources);
        if(changed){
          await layers?.archiveSources(project,{previous:state.index?.sources??[],current:sources},exec);
          checkAbort(exec.signal);
          state.index={generation:(state.index?.generation??0)+1,parserVersion:PARSER_VERSION,indexedAt:new Date().toISOString(),sources};
        }
        return {status:'ready',generation:state.index.generation,sources:sources.length,chunks,skipped,parserVersion:PARSER_VERSION,retrieval:'bm25',embedding:null};
      });
    },
    async search(project,{query,limit=5},exec) {
      const index=store.read(project).index;
      if(!index)return {status:'not_indexed',hits:[]};
      if(index.parserVersion!==PARSER_VERSION)return {status:'stale',hits:[],reason:'Parser version changed; reindex required'};
      const rows=[];
      for(const source of index.sources) {
        if(scope.isDocumentExcluded(project,source.path))continue;
        try {
          if(digest(await scope.bytes(project,source.path,exec.signal))!==source.sha256)return {status:'stale',hits:[],reason:'Source changed; reindex required'};
        } catch(e) {
          if(e.code==='NOT_FOUND')return {status:'stale',hits:[],reason:'Source removed; reindex required'};
          throw e;
        }
        for(const part of source.parts) rows.push({...part,path:source.path,sha256:source.sha256,warnings:source.warnings});
      }
      checkAbort(exec.signal);
      const ranked=rankBm25(rows,query,limit,selectTokenizer(query)); const hits=[]; let chars=0;
      for(const rank of ranked) {
        const row=rows.find(r=>r.id===rank.id); if(chars+row.text.length>6000)break;
        hits.push({...row,score:rank.score}); chars+=row.text.length;
      }
      return {status:hits.length?'found':'not_found',hits,generation:index.generation,contextCharacters:chars,trust:'untrusted_source_data',retrieval:'bm25',embedding:null};
    },
  };
}
