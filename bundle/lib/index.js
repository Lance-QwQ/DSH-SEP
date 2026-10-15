import manifest from '../../package.json' with { type: 'json' };
import { normalizeBundleConfig } from './configuration.js';

export const name = 'dsh-sep-bundle-installation';
export const provide = ['sepBundleInstallation'];

/** The installation entry does not admit business modules before host adaptation. */
export function apply(ctx, input) {
  const configuration=normalizeBundleConfig(input);
  if (manifest.dshSepBundle?.stage !== 'entry-only') {
    throw new Error('SEP_BUNDLE_STAGE_MISMATCH');
  }
  ctx.provide('sepBundleInstallation', Object.freeze({
    packageName: manifest.name,
    packageVersion: manifest.version,
    state: 'pending',
    businessEnabled: false,
    reason: 'SEP_BUNDLE_ADAPTATION_PENDING',
    configuration,
    configurationApplied: false,
    bindingStatus: 'pending-host-adaptation',
  }));
}
