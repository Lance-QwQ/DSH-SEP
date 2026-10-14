import {createHash} from 'node:crypto';

export const SOURCE=Object.freeze({
 packageName:'@deepseek-ai/dsh-client-ui-brand-official',version:'0.2.1-alpha.2',
 clientSha256:'22bb7e181a8d93372e1d14927b201612b09a02c84ea3d0f36933cfff1de47d71',
 manifestSha256:'a20f688b99c4bafb40b9b98690630da4664aa75e6549053ce4350c5765251c40',
 nativeArtifactId:11886202375,
 nativeCommit:'baf409a2e902015c6d2414605d92328daaf5f379',
 nativeArchiveSha256:'c56dd417cb40c3c42a855dffe83cfab5353eab2d5dbe858f0f7001232cbe6270',
});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const from='\t\t\treturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.BrandWordmark, { includeMark: false });';
const to=`\t\t\treturn (0, react_jsx_runtime.jsxs)("span", {
\t\t\t\tstyle: { display: "inline-flex", alignItems: "center", gap: "6px" },
\t\t\t\tchildren: [
\t\t\t\t\t(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.BrandWordmark, { includeMark: false }),
\t\t\t\t\t(0, react_jsx_runtime.jsxs)("svg", {
\t\t\t\t\t\t"data-dsh-sep-badge": "true", "aria-hidden": true,
\t\t\t\t\t\twidth: 32, height: 14, viewBox: "0 0 32 14",
\t\t\t\t\t\tstyle: { width: "32px", height: "14px", minWidth: "32px", maxWidth: "32px", flexShrink: 0, display: "block" },
\t\t\t\t\t\tchildren: [
\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("rect", { width: 32, height: 14, rx: 2, fill: "currentColor" }),
\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("text", { x: 16, y: 10.2, textAnchor: "middle", fontFamily: "inherit", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, fill: "var(--dsw-alias-label-primary-inverted)", children: "SEP" })
\t\t\t\t\t\t]
\t\t\t\t\t})
\t\t\t\t]
\t\t\t});`;

// The official mark, official HARNESS artwork, host peers, and slot wiring stay
// byte-identical. This pure transform never writes into an installed package.
export function deriveBrandIdentity({client,manifest}){
 if(!Buffer.isBuffer(client)||hash(client)!==SOURCE.clientSha256)fail('SEP_MAC_BRAND_SOURCE_CHANGED');
 if(!Buffer.isBuffer(manifest)||hash(manifest)!==SOURCE.manifestSha256)fail('SEP_MAC_BRAND_MANIFEST_CHANGED');
 const transformations=[
  {name:'add-independent-sep-badge',from,to,count:1},
  {name:'remove-obsolete-source-map-reference',from:'//# sourceMappingURL=client.js.map',to:'// SEP derived branding: origin recorded separately.',count:1},
 ];
 let text=client.toString('utf8');
 for(const row of transformations){
  if(text.split(row.from).length-1!==1)fail('SEP_MAC_BRAND_ANCHOR_CHANGED');
  text=text.replace(row.from,row.to);
 }
 const result=Buffer.from(text,'utf8');
 return {client:result,origin:{schema:1,scope:'sidebar branding only; no desktop or runtime behavior change',source:SOURCE,sourceSha256:hash(client),manifestSha256:hash(manifest),resultSha256:hash(result),transformations}};
}
