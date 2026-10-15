// The tests exercise process/lease logic, not profile composition. Never fake profile results.
import {registerHooks} from 'node:module';
const modules={
 '@deepseek-ai/dsh-app-boot':'export const resolveBundleDir=fail,readProfileManifest=fail,loadOptionalPatches=fail,loadOverlayPatches=fail,composeEntries=fail;function fail(){throw Error("UNEXPECTED_PROFILE_COMPOSITION_IN_LIFECYCLE_TEST");}',
 'js-yaml':'export const JSON_SCHEMA=null;export function load(){throw Error("UNEXPECTED_YAML_IN_LIFECYCLE_TEST")}',
 'semver':'export default new Proxy({}, {get(){throw Error("UNEXPECTED_SEMVER_IN_LIFECYCLE_TEST")}});'
};
registerHooks({resolve(specifier,context,next){if(specifier==='js-yaml')return {shortCircuit:true,url:new URL('./lifecycle-yaml.cjs',import.meta.url).href};if(specifier==='@deepseek-ai/dsh-app-boot/package.json')return {shortCircuit:true,url:import.meta.url};return Object.hasOwn(modules,specifier)?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(modules[specifier])}:next(specifier,context);}});