// One launcher owns exactly one Host generation. New launches rotate endpoint
// and bearer token; there is no in-process restart or generation reuse route.
export function desktopReply({method,profile,phase,pid,generation,ready}){
 if(!Number.isSafeInteger(generation)||generation<1||!Number.isSafeInteger(pid)||pid<1)throw Error('SEP_LINUX_DESKTOP_IDENTITY');
 if(method==='desktopStatus')return {projectDir:profile,dshVersion:'0.2.1-alpha.2',protocolVersion:4,transport:'desktop-http',guardian:{phase,pid,generation}};
 if(phase!=='running')throw Error('SEP_LINUX_HOST_NOT_RUNNING');
 if(method==='startHost')return {phase,pid,generation};
 if(method==='desktopReady')return {...ready,transport:'desktop-http',dshVersion:'0.2.1-alpha.2',pid,generation};
 throw Error('SEP_LINUX_DESKTOP_METHOD');
}
