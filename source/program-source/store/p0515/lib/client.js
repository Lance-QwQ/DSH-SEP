window.__ModuleLoader__.load({id:"dsh-sep-brand",factory:(require)=>{const module={exports:{}};const exports=module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/sep/dsh-sep-brand/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function SepBrandName() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { "data-sep-brand": "true", style: { display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.BrandWordmark, { includeMark: false }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: "32", height: "16", viewBox: "0 0 32 16", role: "img", "aria-label": "SEP", style: { flexShrink: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("mask", { id: "dsh-sep-wordmark-cutout", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { width: "32", height: "16", rx: "2", fill: "white" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: "16", y: "11.8", textAnchor: "middle", fill: "black", fontFamily: "Consolas, monospace", fontSize: "12", fontWeight: "700", children: "SEP" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { width: "32", height: "16", rx: "2", fill: "currentColor", mask: "url(#dsh-sep-wordmark-cutout)" })
    ] })
  ] });
}
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({ name: "sidebar.brand.name", priority: -10 }, SepBrandName));
}

return module.exports;}});
