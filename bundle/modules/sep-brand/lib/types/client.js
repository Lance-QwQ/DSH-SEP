import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrandWordmark } from '@deepseek-ai/dsh-client-ui-primitives';
function SepBrandName() {
    // One viewBox keeps the 52 x 14 HARNESS and 32 x 14 SEP badges aligned.
    // The official 156 x 24 wordmark ends before the separate SEP badge at x=162.
    return _jsxs("svg", { "data-sep-brand": "true", width: "194", height: "24", viewBox: "0 0 194 24", role: "img", "aria-label": "DeepSeek Harness SEP", style: { display: 'block', maxWidth: '100%', height: 'auto', flexShrink: 1 }, children: [_jsx(BrandWordmark, { includeMark: false }), _jsxs("g", { transform: "translate(162 0)", children: [_jsx("defs", { children: _jsxs("mask", { id: "dsh-sep-wordmark-cutout", children: [_jsx("rect", { y: "5.5", width: "32", height: "14", rx: "2", fill: "white" }), _jsx("text", { x: "16", y: "16.3", textAnchor: "middle", fill: "black", fontFamily: "Consolas, monospace", fontSize: "12", fontWeight: "700", children: "SEP" })] }) }), _jsx("rect", { y: "5.5", width: "32", height: "14", rx: "2", fill: "currentColor", mask: "url(#dsh-sep-wordmark-cutout)" })] })] });
}
export const inject = ['slots'];
/** Disposing this plugin restores the official brand-slot occupant. */
export function apply(ctx) {
    ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -10 }, SepBrandName));
}
//# sourceMappingURL=client.js.map