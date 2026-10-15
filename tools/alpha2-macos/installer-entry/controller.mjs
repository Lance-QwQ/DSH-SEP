// Trusted assembler input only. No public CLI or environment path overrides.
import {createController} from './controller-core.mjs';
export const openInstallerController=config=>createController(config,false);
