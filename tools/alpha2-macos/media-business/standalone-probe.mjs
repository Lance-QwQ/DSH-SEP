import {readFile} from 'node:fs/promises';
import {hash} from '../business/bounded-read.mjs';
let source=await readFile(new URL('../business/standalone-probe.mjs',import.meta.url),'utf8');if(hash(source)!=='bbadc2b1121e9dc7489a78aebdcbd28aec5c95cfca9591a2180ee2d57d4e9464')throw Error('MEDIA_PROBE_ORIGIN_CHANGED');
source=source.replace("from './standalone.mjs'","from '"+new URL('./standalone.mjs',import.meta.url).href+"'");
const before="phase:'ready',status:response.status";if(source.split(before).length!==2)throw Error('MEDIA_PROBE_SETTINGS_ANCHOR');source=source.replace(before,"phase:'ready',settings:business.ready.settings,status:response.status");
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
