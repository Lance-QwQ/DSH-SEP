import schema from '../config/schema.json' with { type: 'json' };

function invalid() {
  throw Object.assign(new Error('SEP_BUNDLE_CONFIG_INVALID'), {code:'SEP_BUNDLE_CONFIG_INVALID'});
}
function normalize(value, rule) {
  if(value===undefined) value=structuredClone(rule.default);
  if(rule.type==='object') {
    if(value===null || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) invalid();
    if(Object.keys(value).some(key=>!Object.hasOwn(rule.properties,key))) invalid();
    return Object.fromEntries(Object.entries(rule.properties).map(([key,child])=>[key,normalize(Object.hasOwn(value,key)?value[key]:undefined,child)]));
  }
  if(rule.type==='boolean' && typeof value!=='boolean') invalid();
  if(rule.type==='string' && typeof value!=='string') invalid();
  if(rule.type==='number' || rule.type==='integer') {
    if(typeof value!=='number' || !Number.isFinite(value) || rule.type==='integer' && !Number.isInteger(value)) invalid();
    if(rule.minimum!==undefined && value<rule.minimum || rule.maximum!==undefined && value>rule.maximum) invalid();
    if(rule.multipleOf===0.01 && Math.round(value*100)/100!==value) invalid();
  }
  if(rule.const!==undefined && value!==rule.const || rule.enum && !rule.enum.includes(value)) invalid();
  return value;
}
function freeze(value) {
  if(value && typeof value==='object') {for(const child of Object.values(value)) freeze(child);Object.freeze(value);}
  return value;
}

/** Configuration intent only. No filesystem, ledger initialization, or host activation. */
export function normalizeBundleConfig(input) {
  const value=normalize(input,schema);
  if(value.budget.roundLimitCny>value.budget.sharedLimitCny) invalid();
  return freeze(value);
}
