// Test-only factory; excluded from every production runtime closure.
import {createController} from './controller-core.mjs';
export const openTestInstallerController=config=>createController(config,true);
