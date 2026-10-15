import {frozen,transform,evaluate} from './derive.mjs';
// Exact frozen image/real-Loader assertions, running the combined runtime.
for(const [path,sha256]of [['vision.test.mjs','d44472de42e930fece79465e689e0752cc368bfc27b8cebbd39ef819607d3700'],['loader.test.mjs','51f44ea13098f59693fd1c73dbfee546b2de37ca0164ddfd2245d880f5d2713e']]){
 const file=new URL('../media-business/'+path,import.meta.url),source=await frozen(file,sha256);
 const derived=transform(source,[{before:"from './fixture.mjs'",after:"from '../document-business/combined-fixture.mjs'"}]);await evaluate(derived.source,file);
}
