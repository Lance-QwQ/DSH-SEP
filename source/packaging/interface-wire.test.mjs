import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.env.SEP_TEST_PROGRAM;
assert(root, 'SEP_TEST_PROGRAM must identify the isolated installed program');
const value = {absolutePath:'C:\\synthetic\\document.docx',version:'v1',offset:0,
  data:'JVBERi0xLjcK',eof:true,bytes:9,missingFonts:[],generation:'conversion-1',fontDiagnostics:'unavailable'};
for (const name of ['typert.remote-client.js','typert.host.js']) {
  const exports = await import(pathToFileURL(join(root,'store/p0437/lib',name)));
  const model = exports.TYPERT_REMOTE ?? exports.TYPERT;
  const schema = (model.descriptors ?? model.invocations).find(x=>x.method==='render').result.create();
  test(name+': an empty font list preserves unavailable diagnostic status over the wire',()=>{
    const roundtrip = schema.parse(value);
    assert.equal(roundtrip.fontDiagnostics,'unavailable');
    assert.deepEqual(roundtrip.missingFonts,[]);
  });
  test(name+': an unsupported font diagnostic claim is rejected',()=>{
    assert.throws(()=>schema.parse({...value,fontDiagnostics:'all-fonts-proven-present'}));
  });
}
