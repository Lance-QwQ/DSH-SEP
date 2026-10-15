// Only unrelated profile APIs use throwing stubs. ZIP parsing is the real pinned library.
import './lifecycle-dependencies.mjs';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
if(process.env.SEP_TEST_YAUZL)registerHooks({resolve(s,c,next){return s==='yauzl'?{shortCircuit:true,url:pathToFileURL(process.env.SEP_TEST_YAUZL).href}:next(s,c);}});
