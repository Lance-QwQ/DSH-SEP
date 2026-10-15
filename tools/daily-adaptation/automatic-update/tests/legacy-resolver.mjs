// Relocate original monorepo test imports to actual installed modules. No doubles.
import {registerHooks} from 'node:module';import {pathToFileURL} from 'node:url';import {join} from 'node:path';
const H=process.env.SEP_DAILY_MANAGED_HOST;
registerHooks({resolve(specifier,context,next){const m=/packages\/sep\/(system-enhancement-package|recovery)\/(.*)$/.exec(specifier);if(m)return {shortCircuit:true,url:pathToFileURL(join(H,'node_modules',m[1]==='recovery'?'@deepseek-ai/dsh-recovery':'dsh-sep-bundle/bundle/modules/system-enhancement-package',m[2])).href};return next(specifier,context);}});
