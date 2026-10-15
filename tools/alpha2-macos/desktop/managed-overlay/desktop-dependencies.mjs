import {posix} from 'node:path';
// R6's materialized main retained these imports, whereas the upstream desktop
// build inlines its devDependencies. Reuse only the same fixed carrier's host
// packages; never resolve them from a CI global installation or download here.
export const DESKTOP_DEPENDENCIES=Object.freeze(['@deepseek-ai/dsh-app-boot','@deepseek-ai/dsh-home-paths','@deepseek-ai/dsh-deepseek-account','@deepseek-ai/dsh-client-shortcuts','@deepseek-ai/dsh-atomic-write']);
export function planDesktopDependencies(manifests){const rows=[];for(const name of DESKTOP_DEPENDENCIES){const path='node_modules/'+name,existing=manifests.get(path+'/package.json');if(existing){if(existing.name!==name||existing.version!=='0.2.1-alpha.2')throw Error('SEP_MAC_DESKTOP_DEPENDENCY_VERSION');continue;}const source='dsh/node_modules/'+name,manifest=manifests.get(source+'/package.json');if(!manifest)throw Error('SEP_MAC_DESKTOP_DEPENDENCY_MISSING');if(manifest.name!==name||manifest.version!=='0.2.1-alpha.2')throw Error('SEP_MAC_DESKTOP_DEPENDENCY_VERSION');rows.push({name,path,source,target:posix.relative(posix.dirname(path),source),version:manifest.version});}return rows;}
