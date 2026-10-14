import {parseDocument} from './suite/parsers.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
try{
 const chunks=[];let size=0;for await(const bytes of process.stdin){size+=bytes.length;if(size>12*1024*1024)fail('TOO_LARGE');chunks.push(bytes);}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 if(!value||Object.keys(value).sort().join(',')!=='bytes,extension'||typeof value.bytes!=='string'||!['.txt','.md','.csv','.json','.pdf','.docx'].includes(value.extension)||value.bytes.length%4!==0)fail('INVALID_INPUT');
 const bytes=Buffer.from(value.bytes,'base64');if(bytes.toString('base64')!==value.bytes)fail('INVALID_INPUT');if(bytes.length>8*1024*1024)fail('TOO_LARGE');
 const result=await parseDocument(bytes,value.extension,{maxBytes:8*1024*1024,maxChars:500000,timeoutMs:15000});
 process.stdout.write(JSON.stringify(result));
}catch(error){const code=/^[A-Z][A-Z0-9_]{0,72}$/.test(error?.code??'')?error.code:'PARSER_FAILED';process.stderr.write(code);process.exitCode=1;}
