import * as plugin from './linux-attachments.mjs';
export * as maintenance from './linux-attachment-maintenance.mjs';
export async function coldAttachments(ctx,{source,storageRoot,initialize=true,files}){
 const fiber=ctx.plugin(plugin,{source,storageRoot,initialize,...files?{files}:{}});await fiber;return fiber;
}
