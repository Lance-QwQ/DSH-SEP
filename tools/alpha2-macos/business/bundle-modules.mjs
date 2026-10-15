import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyCapture} from './capture-runtime.mjs';
export const bundleRoot=process.env.SEP_MAC_BUNDLE_ROOT;
export const manifest=await verifyCapture(bundleRoot);
export const owned=path=>import(pathToFileURL(join(bundleRoot,'bundle',path)));
