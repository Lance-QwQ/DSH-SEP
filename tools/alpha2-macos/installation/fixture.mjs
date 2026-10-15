import{mkdir,writeFile,readFile,chmod,copyFile,realpath,symlink}from'node:fs/promises';
import{join,dirname}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';import{createHash}from'node:crypto';
import{inventoryPackage}from'../package/package-inventory.mjs';import{buildBootstrapManifest}from'../package/bootstrap-manifest-builder.mjs';
const exec=promisify(execFile);export const hash=b=>createHash('sha256').update(b).digest('hex');
export async function fixture(root){
 root=await realpath(root);const sourceApp=join(root,'source','DSH SEP.app'),contents=join(sourceApp,'Contents'),parent=join(root,'Applications'),dataRoot=join(root,'account-data');
 await mkdir(parent,{mode:0o700});await mkdir(contents,{recursive:true,mode:0o755});
 async function text(path,value,mode=0o644){await mkdir(dirname(path),{recursive:true,mode:0o755});await writeFile(path,value,{flag:'wx',mode});await chmod(path,mode);}
 const c=join(root,'fixture.c'),native=join(root,'fixture-bin');await text(c,'int main(void){return 0;}\n');await exec('/usr/bin/clang',[c,'-o',native],{timeout:30000});
 async function binary(path){await mkdir(dirname(path),{recursive:true,mode:0o755});await copyFile(native,path);await chmod(path,0o555);}
 const appRoot='Helpers/DSH SEP Desktop.app',node=appRoot+'/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node',electron=appRoot+'/Contents/MacOS/DSH SEP',runtime='Resources/product/runtime',payload='Resources/product/payload',hostRoot=payload+'/host',bundleRoot=hostRoot+'/sep-capture',parserRoot=payload+'/parser-runtime';
 for(const path of[appRoot,hostRoot,bundleRoot,parserRoot])await mkdir(join(contents,path),{recursive:true,mode:0o755});
 for(const path of['MacOS/DSH SEP',node,electron,runtime+'/native/apfs-tree',runtime+'/native/attachment-tree'])await binary(join(contents,path));
 await text(join(contents,runtime+'/bootstrap/controller.mjs'),'// Hash-captured synthetic artifact. Never executed by installer tests.\n');await text(join(contents,runtime+'/desktop/business.mjs'),'export const synthetic=true;\n');await text(join(contents,runtime+'/native/lease.mjs'),'export const synthetic=true;\n');
 await text(join(contents,appRoot,'Contents/Resources/app.asar'),'synthetic ASAR bytes, never executed\n');await text(join(contents,parserRoot,'manifest.json'),'{}\n');
 const paths={node,electron,asar:appRoot+'/Contents/Resources/app.asar',business:runtime+'/desktop/business.mjs',ownerLease:runtime+'/native/lease.mjs',helper:runtime+'/native/apfs-tree',attachmentHelper:runtime+'/native/attachment-tree',parserManifest:parserRoot+'/manifest.json'};
 const entries=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([role,path])=>[role,{path,sha256:hash(await readFile(join(contents,path)))}])));
 const program={schema:4,layout:'macos-app-v1',validationScope:'isolated-macos-preview',dshVersion:'0.2.1-alpha.2',hostRoot,bundleRoot,appRoot,parserRoot,capabilities:['governed-images','trusted-parsers'],entries};
 const info=name=>`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>DSH SEP</string><key>CFBundleIdentifier</key><string>${name}</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`;
 await text(join(contents,appRoot,'Contents/Info.plist'),info('app.dshsep.install-fixture.desktop'));
 await exec('/usr/bin/codesign',['--force','--sign','-',join(contents,appRoot)],{timeout:30000});
 // Signing may mutate the nested binary; bind its final bytes.
 for(const[role,path]of Object.entries(paths))program.entries[role].sha256=hash(await readFile(join(contents,path)));
 await text(join(contents,'Resources/PROGRAM.json'),JSON.stringify(program)+'\n',0o444);
 await text(join(contents,'Resources/BOOTSTRAP.json'),JSON.stringify(await buildBootstrapManifest(contents))+'\n',0o444);
 await text(join(contents,'Info.plist'),info('app.dshsep.macos.alpha2.preview'));await text(join(contents,'Resources/README.txt'),'Synthetic first-install fixture. Not a runnable DSH distribution.\n');
 await mkdir(join(contents,'Resources/versions'),{mode:0o755});await symlink('../README.txt',join(contents,'Resources/versions/current'));
 await exec('/usr/bin/codesign',['--force','--sign','-',sourceApp],{timeout:30000});await exec('/usr/bin/codesign',['--verify','--deep','--strict',sourceApp],{timeout:30000});
 const receipt={inventory:await inventoryPackage(sourceApp),programSha256:hash(await readFile(join(contents,'Resources/PROGRAM.json'))),bootstrapSha256:hash(await readFile(join(contents,'Resources/BOOTSTRAP.json')))};
 return{sourceApp,parent,dataRoot,receipt,helperPath:process.env.SEP_INSTALL_HELPER,helperSha256:hash(await readFile(process.env.SEP_INSTALL_HELPER))};
}
