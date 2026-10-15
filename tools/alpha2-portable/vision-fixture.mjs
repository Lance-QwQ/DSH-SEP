import {createRequire} from 'node:module';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {fixture} from './transaction-fixtures.mjs';
import {setup,ok} from './sep-fixture.mjs';
import {bundleRoot} from './bundle-modules.mjs';
import {load} from './host-modules.mjs';
const {createCanvas}=createRequire(join(bundleRoot,'package.json'))('@napi-rs/canvas');
const {deepSeekImageRequestPricing}=await load('@deepseek-ai/dsh-llm-deepseek');
export const vision={enabled:true,allowUpload:true};
export async function imageFixture(){const f=await fixture();for(const [name,colour]of [['图像.png','#00ff00'],['second.png','#ff0000']]){const c=createCanvas(8,8),x=c.getContext('2d');x.fillStyle=colour;x.fillRect(0,0,8,8);await writeFile(join(f.source,name),c.toBuffer('image/png'));}return f;}
export async function setupVision(options={}){return setup({base:options.base??await imageFixture(),business:{vision},imageCapable:true,imagePricing:(_provider,model)=>deepSeekImageRequestPricing({models:[{id:model,inputModalities:['image']}]},model),...options});}
export const invoke=(f,path='图像.png')=>f.call('suite_vision',{path,question:'What colour is shown?'});
export const limit=(work,ms=5000)=>{let timer;return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('fixture deadline')),ms);})]).finally(()=>clearTimeout(timer));};
export const code=result=>result.error?.info?.code??result.error?.message?.split(':')[0];
export {setup,ok};
