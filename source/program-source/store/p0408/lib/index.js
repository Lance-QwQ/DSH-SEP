import z from "@deepseek-ai/schemastery";
//#region lib/types/config.js
/** Cache limits shared by the Host configuration and browser document previews. */
/** Deployment limits applied before Office preview registration. */
const Config = z.object({ office: z.object({
	maxCachedEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
	maxCachedBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(64 * 1024 * 1024),
	maxPending: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
	maxReaders: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(32)
}) });
//#endregion
//#region lib/types/index.js
/**
* Embed validated preview settings in browser pages.
* @param ctx - Host context serving browser pages.
* @param config - Cache limits adopted when the page loads.
*/
function apply(ctx, config) {
	ctx.on("webserver/index-inject", (table) => {
		table.push({
			kind: "global",
			name: "__DSH_DOCUMENT_PREVIEW_CONFIG__",
			value: config
		});
	});
}
//#endregion
export { Config, apply };
