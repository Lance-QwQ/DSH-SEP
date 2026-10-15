// Test-only loader for the same packaged P2 authority used by the actual app.
// The existing immutable PROGRAM supplies bundleRoot; no empty deletion fallback.
export async function loadFixtureAuthority(config){
 const root=config.p.bundleRoot,prior=process.env.SEP_MAC_BUNDLE_ROOT;
 if(prior!==undefined&&prior!==root)throw Object.assign(Error('SEP_PROJECT_NATIVE_AUTHORITY_BINDING'),{code:'SEP_PROJECT_NATIVE_AUTHORITY_BINDING'});
 const {verifyCapture}=await config.module('business/capture-runtime.mjs');await verifyCapture(root);
 let bundle,documents;
 process.env.SEP_MAC_BUNDLE_ROOT=root;
 try{bundle=await config.module('business/bundle-modules.mjs');if(bundle.bundleRoot!==root)throw Object.assign(Error('SEP_PROJECT_NATIVE_AUTHORITY_BINDING'),{code:'SEP_PROJECT_NATIVE_AUTHORITY_BINDING'});documents=await config.module('business/documents.mjs');}
 finally{if(prior===undefined)delete process.env.SEP_MAC_BUNDLE_ROOT;else process.env.SEP_MAC_BUNDLE_ROOT=prior;}
 const {openControl}=await bundle.owned('modules/system-enhancement-package/src/p2/control.js');
 return {openControl,macDocumentAuthority:documents.macDocumentAuthority};
}
