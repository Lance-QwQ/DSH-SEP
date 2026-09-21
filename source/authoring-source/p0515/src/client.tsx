import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {BrandWordmark} from '@deepseek-ai/dsh-client-ui-primitives'

function SepBrandName() {
  return <span data-sep-brand="true" style={{display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
    <BrandWordmark includeMark={false}/>
    <svg width="32" height="16" viewBox="0 0 32 16" role="img" aria-label="SEP" style={{flexShrink:0}}>
      <defs><mask id="dsh-sep-wordmark-cutout"><rect width="32" height="16" rx="2" fill="white"/><text x="16" y="11.8" textAnchor="middle" fill="black" fontFamily="Consolas, monospace" fontSize="12" fontWeight="700">SEP</text></mask></defs>
      <rect width="32" height="16" rx="2" fill="currentColor" mask="url(#dsh-sep-wordmark-cutout)"/>
    </svg>
  </span>
}
export const inject=['slots']
/** Disposing this plugin restores the official brand-slot occupant. */
export function apply(ctx:Context):void {
  ctx.slots.inject('sidebar.brand.name',()=>ctx.slots.register({name:'sidebar.brand.name',priority:-10},SepBrandName))
}
