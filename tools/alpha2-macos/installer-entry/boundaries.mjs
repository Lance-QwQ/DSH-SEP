const error=code=>Object.assign(Error(code),{code});
export function createAdmission(){
 let tail=Promise.resolve(),closed=false,uncertain=false;
 return Object.freeze({run(work){if(closed)return Promise.reject(error('SEP_INSTALLER_CLOSED'));if(uncertain)return Promise.reject(error('SEP_INSTALLER_CLEANUP_UNCONFIRMED'));const result=tail.then(()=>{if(uncertain)throw error('SEP_INSTALLER_CLEANUP_UNCONFIRMED');return work();});tail=result.catch(()=>{});return result;},quarantine(){uncertain=true;},isQuarantined:()=>uncertain,closeAdmission(){closed=true;return tail;}});
}
export function createLineDecoder(max){
 let parts=[],size=0;const utf8=new TextDecoder('utf-8',{fatal:true});
 return {push(bytes){
  if(!Buffer.isBuffer(bytes))throw error('SEP_INSTALLER_PROTOCOL');const lines=[];let at=0;
  while(at<bytes.length){const end=bytes.indexOf(10,at),part=bytes.subarray(at,end<0?bytes.length:end);size+=part.length;if(size+(end<0?0:1)>max)throw error('SEP_INSTALLER_PROTOCOL');parts.push(part);
   if(end<0)break;
   try{lines.push(utf8.decode(Buffer.concat(parts,size)));}catch{throw error('SEP_INSTALLER_PROTOCOL');}parts=[];size=0;at=end+1;
  }
  return lines;
 }};
}
