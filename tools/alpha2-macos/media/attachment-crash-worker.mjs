import {createMacAttachmentIO} from './attachment-io.mjs';
const {config,domain,entry}=JSON.parse(process.env.SEP_MAC_ATTACHMENT_CRASH);
await createMacAttachmentIO(config).removeFile(domain,entry);
process.stdout.write('deleted\n');setInterval(()=>{},1000);
