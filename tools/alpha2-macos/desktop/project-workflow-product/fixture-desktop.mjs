// TEST ONLY. Replaced by real packaged Electron in native integration.
import {Socket} from 'node:net';import {createClient} from '../project-workflow-ui/transport.mjs';
const port=new Socket({fd:4,readable:true,writable:true});let text='';
const timer=setTimeout(failed,4000);function failed(){clearTimeout(timer);process.exitCode=1;port.destroy();}port.on('error',failed);port.on('close',()=>clearTimeout(timer));
port.on('data',function initialize(bytes){try{text+=bytes.toString();if(text.length>1024)throw Error('oversized initialize');if(!text.endsWith('\n'))return;port.removeListener('data',initialize);const {schema,type,...binding}=JSON.parse(text);if(schema!==1||type!=='initialize')throw Error('bad initialize');const rpc=createClient(port,binding);void rpc.request('status',{}).then(value=>{clearTimeout(timer);process.stdout.write(JSON.stringify(value)+'\n');rpc.closeAdmission();port.end();},failed);}catch{failed();}});
