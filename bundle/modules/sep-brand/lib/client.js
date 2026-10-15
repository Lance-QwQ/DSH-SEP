window.__ModuleLoader__.load({
	id: "dsh-sep-brand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client.js
		function SepBrandName() {
			return (0, react_jsx_runtime.jsxs)("svg", {
				"data-sep-brand": "true",
				width: "194",
				height: "24",
				viewBox: "0 0 194 24",
				role: "img",
				"aria-label": "DeepSeek Harness SEP",
				style: {
					display: "block",
					maxWidth: "100%",
					height: "auto",
					flexShrink: 1
				},
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.BrandWordmark, { includeMark: false }), (0, react_jsx_runtime.jsxs)("g", {
					transform: "translate(162 0)",
					children: [(0, react_jsx_runtime.jsx)("defs", { children: (0, react_jsx_runtime.jsxs)("mask", {
						id: "dsh-sep-wordmark-cutout",
						children: [(0, react_jsx_runtime.jsx)("rect", {
							y: "5.5",
							width: "32",
							height: "14",
							rx: "2",
							fill: "white"
						}), (0, react_jsx_runtime.jsx)("text", {
							x: "16",
							y: "16.3",
							textAnchor: "middle",
							fill: "black",
							fontFamily: "Consolas, monospace",
							fontSize: "12",
							fontWeight: "700",
							children: "SEP"
						})]
					}) }), (0, react_jsx_runtime.jsx)("rect", {
						y: "5.5",
						width: "32",
						height: "14",
						rx: "2",
						fill: "currentColor",
						mask: "url(#dsh-sep-wordmark-cutout)"
					})]
				})]
			});
		}
		const inject = ["slots"];
		/** Disposing this plugin restores the official brand-slot occupant. */
		function apply(ctx) {
			ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({
				name: "sidebar.brand.name",
				priority: -10
			}, SepBrandName));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map