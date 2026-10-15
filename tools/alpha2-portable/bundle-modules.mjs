import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {host} from './host-modules.mjs';
const require=createRequire(join(host,'package.json'));
export const bundleRoot=dirname(require.resolve('dsh-sep-bundle/package.json'));
export const owned=path=>import(pathToFileURL(join(bundleRoot,'bundle',path)));
