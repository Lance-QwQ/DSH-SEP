window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-settings-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:sep-memory-settings/MemorySettingsSection.module.css.mjs
		const css = ".j05uuq_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;font-size:14px;line-height:22px;display:flex}.j05uuq_heading{justify-content:space-between;align-items:center;gap:12px;display:flex}.j05uuq_heading h2{margin:0;font-size:20px;line-height:28px}.j05uuq_section p{margin:0}.j05uuq_description,.j05uuq_row small{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.j05uuq_project{gap:8px;display:grid}.j05uuq_project code{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font-size:12px}.j05uuq_section button,.j05uuq_project select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:6px 12px}.j05uuq_section button{cursor:pointer}.j05uuq_section button:disabled,.j05uuq_project select:disabled,.j05uuq_section input:disabled{opacity:.55;cursor:wait}.j05uuq_section button:focus-visible,.j05uuq_project select:focus-visible,.j05uuq_section input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}.j05uuq_master,.j05uuq_row label{justify-content:space-between;align-items:center;gap:16px;display:flex}.j05uuq_master{padding-top:4px;font-weight:600}.j05uuq_section input{width:22px;height:22px;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer;flex-shrink:0}.j05uuq_controls{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;gap:16px;padding:12px 16px;display:grid}.j05uuq_row{gap:5px;display:grid}.j05uuq_notice{border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);padding-top:14px;font-size:13px;line-height:20px}.j05uuq_error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}@media (width<=480px){.j05uuq_controls{padding:12px}.j05uuq_heading{align-items:flex-start}}";
		const tagId = "@deepseek-ai/dsh-client-ui-settings-memory/MemorySettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-memory";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var MemorySettingsSection_module_css_default = {
			"controls": "j05uuq_controls",
			"description": "j05uuq_description",
			"error": "j05uuq_error",
			"heading": "j05uuq_heading",
			"master": "j05uuq_master",
			"notice": "j05uuq_notice",
			"project": "j05uuq_project",
			"row": "j05uuq_row",
			"section": "j05uuq_section"
		};
		//#endregion
		//#region src/client/MemorySettingsSection.tsx
		/** Project-scoped controls display the last confirmed Host state until save settles. */
		function MemorySettingsSection({ api, requestTimeoutMs, useConnection, t }) {
			const controlId = (0, react.useId)();
			const connection = useConnection((value) => value);
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [catalogError, setCatalogError] = (0, react.useState)(false);
			const [projectId, setProjectId] = (0, react.useState)("");
			const [refresh, setRefresh] = (0, react.useState)(0);
			const [confirmedAt, setConfirmedAt] = (0, react.useState)(null);
			const [view, setView] = (0, react.useState)({
				snapshot: null,
				loading: true,
				saving: false,
				message: null
			});
			const active = (0, react.useRef)(null);
			const pendingWrite = (0, react.useRef)(false);
			const reloadAfterWrite = (0, react.useRef)(false);
			const mounted = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
					active.current?.abort();
				};
			}, []);
			(0, react.useEffect)(() => {
				if (pendingWrite.current) {
					reloadAfterWrite.current = true;
					return;
				}
				const controller = new AbortController();
				setCatalogError(false);
				request((signal) => api.list(signal), controller.signal, requestTimeoutMs).then((value) => {
					if (controller.signal.aborted) return;
					if (pendingWrite.current) {
						reloadAfterWrite.current = true;
						return;
					}
					setCatalog(value);
					setProjectId((previous) => value.projects.some((project) => project.id === previous) ? previous : value.projects[0]?.id ?? "");
				}, () => {
					if (controller.signal.aborted) return;
					if (pendingWrite.current) {
						reloadAfterWrite.current = true;
						return;
					}
					setCatalogError(true);
					setCatalog(null);
				});
				return () => controller.abort();
			}, [
				api,
				connection,
				refresh,
				requestTimeoutMs
			]);
			(0, react.useEffect)(() => {
				if (!catalog?.available || projectId === "" || pendingWrite.current) return;
				const controller = new AbortController();
				active.current?.abort();
				active.current = controller;
				setView({
					snapshot: null,
					loading: true,
					saving: false,
					message: null
				});
				request((signal) => api.get(projectId, signal), controller.signal, requestTimeoutMs).then((snapshot) => {
					if (!controller.signal.aborted) {
						setConfirmedAt(Date.now());
						setView({
							snapshot,
							loading: false,
							saving: false,
							message: null
						});
					}
				}, () => {
					if (!controller.signal.aborted) setView({
						snapshot: null,
						loading: false,
						saving: false,
						message: "readError"
					});
				});
				return () => controller.abort();
			}, [
				api,
				catalog,
				projectId,
				requestTimeoutMs
			]);
			const save = async (controls) => {
				if (pendingWrite.current || view.snapshot === null || view.loading) return;
				const expected = view.snapshot.controls;
				pendingWrite.current = true;
				const controller = new AbortController();
				active.current?.abort();
				active.current = controller;
				setView((previous) => ({
					...previous,
					saving: true,
					message: null
				}));
				try {
					const snapshot = await request((signal) => api.update(projectId, expected, controls, signal), controller.signal, requestTimeoutMs);
					if (mounted.current && !controller.signal.aborted && !reloadAfterWrite.current) {
						setConfirmedAt(Date.now());
						setView({
							snapshot,
							loading: false,
							saving: false,
							message: null
						});
					}
				} catch (error) {
					if (!mounted.current || controller.signal.aborted) return;
					const message = error instanceof Error && error.message === "MEMORY_SETTINGS_CONFLICT" ? "conflict" : "unconfirmed";
					setView((previous) => ({
						...previous,
						saving: true,
						message
					}));
					if (reloadAfterWrite.current) return;
					try {
						const snapshot = await request((signal) => api.get(projectId, signal), controller.signal, requestTimeoutMs);
						if (mounted.current && !controller.signal.aborted && !reloadAfterWrite.current) {
							setConfirmedAt(Date.now());
							setView({
								snapshot,
								loading: false,
								saving: false,
								message
							});
						}
					} catch {
						if (mounted.current && !controller.signal.aborted) setView({
							snapshot: null,
							loading: false,
							saving: false,
							message
						});
					}
				} finally {
					pendingWrite.current = false;
					if (mounted.current && reloadAfterWrite.current) {
						reloadAfterWrite.current = false;
						setView((previous) => ({
							...previous,
							snapshot: null,
							loading: true,
							saving: false
						}));
						setRefresh((value) => value + 1);
					}
				}
			};
			const snapshot = view.snapshot;
			const project = catalog?.projects.find((value) => value.id === projectId);
			const unavailable = catalog !== null && (!catalog.available || catalog.projects.length === 0);
			const busy = view.loading || view.saving;
			const state = (key) => {
				if (!snapshot?.controls[key]) return "paused";
				if (!snapshot.configured[key]) return "capped";
				return snapshot.effective[key] ? "effective" : "ineffective";
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: MemorySettingsSection_module_css_default.section,
				"aria-labelledby": `${controlId}-title`,
				"aria-busy": busy,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MemorySettingsSection_module_css_default.heading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: `${controlId}-title`,
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: view.saving,
							onClick: () => setRefresh((value) => value + 1),
							children: t("refresh")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MemorySettingsSection_module_css_default.description,
						children: t("scope")
					}),
					catalogError || unavailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: MemorySettingsSection_module_css_default.error,
						children: t(catalogError ? "readError" : "unavailable")
					}) : null,
					catalog !== null && catalog.projects.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: MemorySettingsSection_module_css_default.project,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: `${controlId}-project`,
								children: t("project")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								id: `${controlId}-project`,
								value: projectId,
								disabled: view.saving,
								onChange: (event) => setProjectId(event.currentTarget.value),
								children: catalog.projects.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: value.id,
									children: value.label
								}, value.id))
							}),
							project ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: project.root }) : null
						]
					}) : null,
					!catalogError && !unavailable && view.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("loading")
					}) : null,
					view.message ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: MemorySettingsSection_module_css_default.error,
						children: t(view.message)
					}) : null,
					snapshot !== null && !catalogError && !unavailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: MemorySettingsSection_module_css_default.master,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("master") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								role: "switch",
								"aria-label": t("master"),
								checked: snapshot.controls.capture || snapshot.controls.recall,
								disabled: busy,
								onChange: (event) => {
									const enabled = event.currentTarget.checked;
									save({
										capture: enabled,
										recall: enabled
									});
								}
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MemorySettingsSection_module_css_default.description,
							children: t("masterHelp")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: MemorySettingsSection_module_css_default.controls,
							children: ["capture", "recall"].map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: MemorySettingsSection_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(key) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									role: "switch",
									"aria-label": t(key),
									checked: snapshot.controls[key],
									disabled: busy,
									onChange: (event) => void save({
										...snapshot.controls,
										[key]: event.currentTarget.checked
									})
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
									t("stored"),
									": ",
									t(snapshot.controls[key] ? "on" : "off"),
									" · ",
									t(state(key))
								] })]
							}, key))
						}),
						view.saving ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: t("saving")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: MemorySettingsSection_module_css_default.description,
							children: t("freshness")
						}),
						confirmedAt !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: MemorySettingsSection_module_css_default.description,
							children: [
								t("readAt"),
								": ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
									dateTime: new Date(confirmedAt).toISOString(),
									children: new Date(confirmedAt).toLocaleString()
								})
							]
						}) : null,
						snapshot.runtime.state === "degraded" || snapshot.runtime.state === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: MemorySettingsSection_module_css_default.error,
							role: "status",
							children: [t("runtimeUnavailable"), snapshot.runtime.lastError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: snapshot.runtime.lastError }) : null]
						}) : null
					] }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: MemorySettingsSection_module_css_default.notice,
						children: t("noDelete")
					})
				]
			});
		}
		/** Deadline cancellation never retries a mutation; callers re-read after uncertain results. */
		async function request(operation, parent, timeoutMs) {
			const timeout = new AbortController();
			const signal = AbortSignal.any([parent, timeout.signal]);
			let timer;
			let abort;
			try {
				const cancelled = new Promise((_resolve, reject) => {
					abort = () => reject(/* @__PURE__ */ new Error("MEMORY_SETTINGS_UNCONFIRMED"));
					if (signal.aborted) abort();
					else signal.addEventListener("abort", abort, { once: true });
					timer = setTimeout(() => timeout.abort(), timeoutMs);
				});
				return await Promise.race([operation(signal), cancelled]);
			} finally {
				if (timer !== void 0) clearTimeout(timer);
				if (abort !== void 0) signal.removeEventListener("abort", abort);
			}
		}
		//#endregion
		//#region src/errors.ts
		const PUBLIC_CODES = /* @__PURE__ */ new Set([
			"MEMORY_SETTINGS_CONFLICT",
			"MEMORY_SETTINGS_PROJECT",
			"MEMORY_SETTINGS_UNAVAILABLE",
			"MEMORY_SETTINGS_INPUT",
			"DISPOSED",
			"ABORTED"
		]);
		/** Preserve only owned error codes; stacks, paths and memory content never become UI copy. */
		function safeErrorCode(value) {
			return typeof value === "string" && PUBLIC_CODES.has(value) ? value : "MEMORY_SETTINGS_UNAVAILABLE";
		}
		//#endregion
		//#region src/client/api.ts
		/** Bind package-private calls to Connection; validate every returned JSON record. */
		function createMemorySettingsApi(rpc) {
			const call = async (endpoint, payload, signal) => {
				const result = await rpc.call("/api", "sep-memory/" + endpoint, payload, signal);
				if (!result.ok) throw new Error(safeErrorCode(result.error.message));
				return result.value;
			};
			return {
				list: async (signal) => parseList(await call("list", {}, signal)),
				get: async (projectId, signal) => parseSnapshot(await call("get", { projectId }, signal), projectId),
				update: async (projectId, expected, controls, signal) => parseSnapshot(await call("update", {
					projectId,
					expected,
					controls
				}, signal), projectId)
			};
		}
		function record(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		function text(value, maximum) {
			return typeof value === "string" && value.length > 0 && value.length <= maximum;
		}
		function pair(value) {
			return record(value) && typeof value.capture === "boolean" && typeof value.recall === "boolean";
		}
		function nullableCode(value) {
			return value === null || typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value);
		}
		function invalid() {
			throw new Error("MEMORY_SETTINGS_RESPONSE");
		}
		function parseList(value) {
			if (!record(value) || value.version !== 1 || typeof value.available !== "boolean" || !nullableCode(value.reason) || !Array.isArray(value.projects) || value.projects.length > 1024) return invalid();
			const ids = /* @__PURE__ */ new Set();
			for (const project of value.projects) {
				if (!record(project) || !text(project.id, 4096) || !text(project.label, 32768) || !text(project.root, 32768) || ids.has(project.id)) return invalid();
				ids.add(project.id);
			}
			return value;
		}
		function parseSnapshot(value, projectId) {
			if (!record(value) || value.version !== 1 || value.projectId !== projectId || !pair(value.controls) || !pair(value.configured) || !pair(value.effective) || !record(value.runtime) || ![
				"ready",
				"degraded",
				"disabled",
				"unavailable"
			].includes(String(value.runtime.state)) || !nullableCode(value.runtime.lastError) || value.scope !== "project" || value.transition !== "next-operation") return invalid();
			return value;
		}
		//#endregion
		//#region src/client/locales.ts
		/** Product-owned Chinese and English copy; fixed keys keep both dictionaries complete. */
		const zh = {
			title: "记忆增强",
			master: "自动记忆增强",
			capture: "自动学习新信息",
			recall: "自动引用已有记忆",
			project: "项目",
			refresh: "刷新",
			scope: "项目级设置：影响所选项目的会话，可与标准、PTC、创造、极简模式组合。",
			masterHelp: "主开关开启两项，关闭暂停两项；也可分别调整，只开启需要的一项。",
			noDelete: "关闭不会删除已有记忆，不影响手动查询、编辑、删除与到期治理；已经进入当前对话的信息不会因此移除。",
			stored: "已保存",
			readAt: "上次确认",
			on: "开",
			off: "关",
			effective: "已生效",
			paused: "已暂停",
			capped: "受宿主配置限制",
			ineffective: "当前未生效",
			loading: "正在读取项目记忆设置…",
			saving: "等待当前记忆处理结束，保存后生效；请勿重复提交。",
			freshness: "显示上次读取的状态；其他会话可能更改设置，可点击刷新。变更从下一次记忆操作生效。",
			readError: "无法读取记忆设置，请刷新后重试。",
			unavailable: "记忆服务或已配置项目当前不可用，无法确认开关状态。",
			unconfirmed: "保存结果未确认，已尝试重新读取当前状态；不会自动重复提交。",
			conflict: "设置已被其他操作更改，已重新读取。请核对后再调整。",
			runtimeUnavailable: "记忆运行状态异常："
		};
		const en = {
			title: "Memory enhancement",
			master: "Automatic memory enhancement",
			capture: "Learn new information automatically",
			recall: "Recall existing memory automatically",
			project: "Project",
			refresh: "Refresh",
			scope: "Project setting: affects sessions in the selected project and combines with Standard, PTC, Creative and Minimal modes.",
			masterHelp: "The main switch enables or pauses both options. You can also enable either option separately.",
			noDelete: "Turning this off does not delete stored memories or stop manual queries, editing, deletion or expiry management. Information already in this conversation remains there.",
			stored: "Saved",
			readAt: "Last confirmed",
			on: "On",
			off: "Off",
			effective: "Effective",
			paused: "Paused",
			capped: "Limited by Host configuration",
			ineffective: "Currently inactive",
			loading: "Reading project memory settings…",
			saving: "Waiting for current memory processing; changes apply after saving. Do not submit again.",
			freshness: "Last-read state. Other sessions may change these settings; refresh to check. Changes apply at the next memory operation.",
			readError: "Could not read memory settings. Refresh to try again.",
			unavailable: "The memory service or configured projects are unavailable; switch state cannot be confirmed.",
			unconfirmed: "Save outcome is uncertain. A fresh read was attempted; the mutation is never retried automatically.",
			conflict: "Another operation changed these settings. They have been read again; review before changing them.",
			runtimeUnavailable: "Memory runtime issue: "
		};
		//#endregion
		//#region ../../../tests/dsh-rc2-profile-20260913/runtime/node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/index.js
		/** Return true when a value is `null` or `undefined`. */
		function isNullable(value) {
			return value === null || value === void 0;
		}
		/** Return true for non-array object values. */
		function isPlainObject(data) {
			return data && typeof data === "object" && !Array.isArray(data);
		}
		/** Filter object entries and return a new object. */
		function filterKeys(object, filter) {
			return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
		}
		/** Map object values while preserving the original key set. */
		function mapValues(object, transform) {
			return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
		}
		/** Pick selected keys from an object, optionally including `undefined` values. */
		function pick(source, keys, forced) {
			if (!keys) return { ...source };
			const result = {};
			for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
			return result;
		}
		/** Test values using `instanceof` with a `toStringTag` fallback. */
		function is(type, value) {
			if (arguments.length === 1) return (value) => is(type, value);
			return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
		}
		function isArrayBufferLike(value) {
			return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
		}
		function isArrayBufferSource(value) {
			return isArrayBufferLike(value) || ArrayBuffer.isView(value);
		}
		/** Binary source detection and base64/hex conversion helpers. */
		var Binary;
		(function(Binary) {
			Binary.is = isArrayBufferLike;
			Binary.isSource = isArrayBufferSource;
			function fromSource(source) {
				if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
				else return source;
			}
			Binary.fromSource = fromSource;
			function toBase64(source) {
				source = fromSource(source);
				if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
				let binary = "";
				const bytes = new Uint8Array(source);
				for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
				return btoa(binary);
			}
			Binary.toBase64 = toBase64;
			function fromBase64(source) {
				if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
				return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
			}
			Binary.fromBase64 = fromBase64;
			function toHex(source) {
				source = fromSource(source);
				if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
				return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
			}
			Binary.toHex = toHex;
			function fromHex(source) {
				if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
				const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
				const buffer = [];
				for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
				return Uint8Array.from(buffer).buffer;
			}
			Binary.fromHex = fromHex;
		})(Binary || (Binary = {}));
		Binary.fromBase64;
		Binary.toBase64;
		Binary.fromHex;
		Binary.toHex;
		/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
		function clone(source, refs = /* @__PURE__ */ new Map()) {
			if (!source || typeof source !== "object") return source;
			if (is("Date", source)) return new Date(source.valueOf());
			if (is("RegExp", source)) return new RegExp(source.source, source.flags);
			if (isArrayBufferLike(source)) return source.slice(0);
			if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
			const cached = refs.get(source);
			if (cached) return cached;
			if (Array.isArray(source)) {
				const result = [];
				refs.set(source, result);
				source.forEach((value, index) => {
					result[index] = Reflect.apply(clone, null, [value, refs]);
				});
				return result;
			}
			const result = Object.create(Object.getPrototypeOf(source));
			refs.set(source, result);
			for (const key of Reflect.ownKeys(source)) {
				const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
				if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
				Reflect.defineProperty(result, key, descriptor);
			}
			return result;
		}
		/** Deeply compare arrays, dates, regexps, buffers, and plain object fields. */
		function deepEqual(a, b, strict) {
			if (a === b) return true;
			if (!strict && isNullable(a) && isNullable(b)) return true;
			if (typeof a !== typeof b) return false;
			if (typeof a !== "object") return false;
			if (!a || !b) return false;
			function check(test, then) {
				return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
			}
			return check(Array.isArray, (a, b) => a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
				if (a.byteLength !== b.byteLength) return false;
				const viewA = new Uint8Array(a);
				const viewB = new Uint8Array(b);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? Object.keys({
				...a,
				...b
			}).every((key) => deepEqual(a[key], b[key], strict));
		}
		/** Time constants plus parsing and formatting helpers. */
		var Time;
		(function(Time) {
			Time.millisecond = 1;
			Time.second = 1e3;
			Time.minute = Time.second * 60;
			Time.hour = Time.minute * 60;
			Time.day = Time.hour * 24;
			Time.week = Time.day * 7;
			let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
			function setTimezoneOffset(offset) {
				timezoneOffset = offset;
			}
			Time.setTimezoneOffset = setTimezoneOffset;
			function getTimezoneOffset() {
				return timezoneOffset;
			}
			Time.getTimezoneOffset = getTimezoneOffset;
			function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
				if (typeof date === "number") date = new Date(date);
				if (offset === void 0) offset = timezoneOffset;
				return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
			}
			Time.getDateNumber = getDateNumber;
			function fromDateNumber(value, offset) {
				const date = new Date(value * Time.day);
				if (offset === void 0) offset = timezoneOffset;
				return new Date(+date + offset * Time.minute);
			}
			Time.fromDateNumber = fromDateNumber;
			const numeric = /\d+(?:\.\d+)?/.source;
			const timeRegExp = new RegExp(`^${[
				"w(?:eek(?:s)?)?",
				"d(?:ay(?:s)?)?",
				"h(?:our(?:s)?)?",
				"m(?:in(?:ute)?(?:s)?)?",
				"s(?:ec(?:ond)?(?:s)?)?"
			].map((unit) => `(${numeric}${unit})?`).join("")}$`);
			function parseTime(source) {
				const capture = timeRegExp.exec(source);
				if (!capture) return 0;
				return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
			}
			Time.parseTime = parseTime;
			function parseDate(date) {
				const parsed = parseTime(date);
				if (parsed) date = Date.now() + parsed;
				else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
				else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
				return date ? new Date(date) : /* @__PURE__ */ new Date();
			}
			Time.parseDate = parseDate;
			function format(ms) {
				const abs = Math.abs(ms);
				if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
				else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
				else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
				else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
				return ms + "ms";
			}
			Time.format = format;
			function toDigits(source, length = 2) {
				return source.toString().padStart(length, "0");
			}
			Time.toDigits = toDigits;
			function template(template, time = /* @__PURE__ */ new Date()) {
				return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
			}
			Time.template = template;
		})(Time || (Time = {}));
		//#endregion
		//#region ../../../tests/dsh-rc2-profile-20260913/runtime/node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/index.mjs
		const kSchema = Symbol.for("schemastery");
		const kValidationError = Symbol.for("ValidationError");
		globalThis.__schemastery_index__ ??= 0;
		globalThis.__schemastery_refs__ = void 0;
		var ValidationError = class extends TypeError {
			options;
			name = "ValidationError";
			constructor(message, options) {
				let prefix = "$";
				for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
				else if (typeof segment === "number") prefix += "[" + segment + "]";
				else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
				if (prefix.startsWith(".")) prefix = prefix.slice(1);
				super((prefix === "$" ? "" : `${prefix} `) + message);
				this.options = options;
			}
			static is(error) {
				return !!error?.[kValidationError];
			}
		};
		Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
		const Schema = function(options) {
			const schema = function(data, options = {}) {
				return Schema.resolve(data, schema, options)[0];
			};
			if (options.refs) {
				const refs = mapValues(options.refs, (options) => new Schema(options));
				const getRef = (uid) => refs[uid];
				for (const key in refs) {
					const options = refs[key];
					options.sKey = getRef(options.sKey);
					options.inner = getRef(options.inner);
					options.list = options.list && options.list.map(getRef);
					options.dict = options.dict && mapValues(options.dict, getRef);
				}
				return refs[options.uid];
			}
			Object.assign(schema, options);
			if (typeof schema.callback === "string") try {
				schema.callback = new Function("return " + schema.callback)();
			} catch {}
			Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
			Object.setPrototypeOf(schema, Schema.prototype);
			schema.meta ||= {};
			schema.toString = schema.toString.bind(schema);
			return schema;
		};
		Schema.prototype = Object.create(Function.prototype);
		Schema.prototype[kSchema] = true;
		Object.defineProperty(Schema.prototype, "~standard", { get() {
			return {
				version: 1,
				vendor: "schemastery",
				validate: (value) => {
					try {
						return { value: Schema.resolve(value, this, {})[0] };
					} catch (error) {
						if (ValidationError.is(error)) return { issues: [{
							message: error.message,
							path: error.options.path
						}] };
						throw error;
					}
				}
			};
		} });
		Schema.ValidationError = ValidationError;
		Schema.prototype.toJSON = function toJSON() {
			if (globalThis.__schemastery_refs__) {
				globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
				return this.uid;
			}
			globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
			globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
			const result = {
				uid: this.uid,
				refs: globalThis.__schemastery_refs__
			};
			globalThis.__schemastery_refs__ = void 0;
			return result;
		};
		Schema.prototype.set = function set(key, value) {
			this.dict[key] = value;
			return this;
		};
		Schema.prototype.push = function push(value) {
			this.list.push(value);
			return this;
		};
		function mergeDesc(original, messages) {
			const result = typeof original === "string" ? { "": original } : { ...original };
			for (const locale in messages) {
				const value = messages[locale];
				if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
				else if (typeof value === "string") result[locale] = value;
			}
			return result;
		}
		function getInner(value) {
			return value?.$value ?? value?.$inner;
		}
		function extractKeys(data) {
			return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
		}
		Schema.prototype.i18n = function i18n(messages) {
			const schema = Schema(this);
			const desc = mergeDesc(schema.meta.description, messages);
			if (Object.keys(desc).length) schema.meta.description = desc;
			if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
				return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
			});
			if (schema.list) schema.list = schema.list.map((inner, index) => {
				return inner.i18n(mapValues(messages, (data = {}) => {
					if (Array.isArray(getInner(data))) return getInner(data)[index];
					if (Array.isArray(data)) return data[index];
					return extractKeys(data);
				}));
			});
			if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
				if (getInner(data)) return getInner(data);
				return extractKeys(data);
			}));
			if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
			return schema;
		};
		Schema.prototype.extra = function extra(key, value) {
			const schema = Schema(this);
			schema.meta = {
				...schema.meta,
				[key]: value
			};
			return schema;
		};
		for (const key of [
			"required",
			"disabled",
			"collapse",
			"hidden",
			"loose"
		]) Object.assign(Schema.prototype, { [key](value = true) {
			const schema = Schema(this);
			schema.meta = {
				...schema.meta,
				[key]: value
			};
			return schema;
		} });
		Schema.prototype.deprecated = function deprecated() {
			const schema = Schema(this);
			schema.meta.badges ||= [];
			schema.meta.badges.push({
				text: "deprecated",
				type: "danger"
			});
			return schema;
		};
		Schema.prototype.experimental = function experimental() {
			const schema = Schema(this);
			schema.meta.badges ||= [];
			schema.meta.badges.push({
				text: "experimental",
				type: "warning"
			});
			return schema;
		};
		Schema.prototype.pattern = function pattern(regexp) {
			const schema = Schema(this);
			const pattern = pick(regexp, ["source", "flags"]);
			schema.meta = {
				...schema.meta,
				pattern
			};
			return schema;
		};
		Schema.prototype.simplify = function simplify(value) {
			if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
			if (isNullable(value)) return value;
			if (this.type === "object" || this.type === "dict") {
				const result = {};
				for (const key in value) {
					const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
					if (this.type === "dict" || !isNullable(item)) result[key] = item;
				}
				if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
				return result;
			} else if (this.type === "array" || this.type === "tuple") {
				const result = [];
				value.forEach((value, index) => {
					const schema = this.type === "array" ? this.inner : this.list[index];
					const item = schema ? schema.simplify(value) : value;
					result.push(item);
				});
				return result;
			} else if (this.type === "intersect") {
				const result = {};
				for (const item of this.list) Object.assign(result, item.simplify(value));
				return result;
			} else if (this.type === "union") for (const schema of this.list) try {
				Schema.resolve(value, schema, {});
				return schema.simplify(value);
			} catch {}
			return value;
		};
		Schema.prototype.toString = function toString(inline) {
			return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
		};
		Schema.prototype.role = function role(role, extra) {
			const schema = Schema(this);
			schema.meta = {
				...schema.meta,
				role,
				extra
			};
			return schema;
		};
		for (const key of [
			"default",
			"link",
			"comment",
			"description",
			"max",
			"min",
			"step"
		]) Object.assign(Schema.prototype, { [key](value) {
			const schema = Schema(this);
			schema.meta = {
				...schema.meta,
				[key]: value
			};
			return schema;
		} });
		const resolvers = {};
		Schema.extend = function extend(type, resolve) {
			resolvers[type] = resolve;
		};
		Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
			if (!schema) return [data];
			if (options.ignore?.(data, schema)) return [data];
			if (isNullable(data) && schema.type !== "lazy") {
				if (schema.meta.required) throw new ValidationError(`missing required value`, options);
				let current = schema;
				let fallback = schema.meta.default;
				while (current?.type === "intersect" && isNullable(fallback)) {
					current = current.list[0];
					fallback = current?.meta.default;
				}
				if (isNullable(fallback)) return [data];
				data = clone(fallback);
			}
			const callback = resolvers[schema.type];
			if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
			try {
				return callback(data, schema, options, strict);
			} catch (error) {
				if (!schema.meta.loose) throw error;
				return [schema.meta.default];
			}
		};
		Schema.from = function from(source) {
			if (isNullable(source)) return Schema.any();
			else if ([
				"string",
				"number",
				"boolean"
			].includes(typeof source)) return Schema.const(source).required();
			else if (source[kSchema]) return source;
			else if (typeof source === "function") switch (source) {
				case String: return Schema.string().required();
				case Number: return Schema.number().required();
				case Boolean: return Schema.boolean().required();
				case Function: return Schema.function().required();
				default: return Schema.is(source).required();
			}
			else throw new TypeError(`cannot infer schema from ${source}`);
		};
		Schema.lazy = function lazy(builder) {
			const toJSON = () => {
				if (!schema.inner[kSchema]) {
					schema.inner = schema.builder();
					schema.inner.meta = {
						...schema.meta,
						...schema.inner.meta
					};
				}
				return schema.inner.toJSON();
			};
			const schema = new Schema({
				type: "lazy",
				builder,
				inner: { toJSON }
			});
			return schema;
		};
		Schema.natural = function natural() {
			return Schema.number().step(1).min(0);
		};
		Schema.percent = function percent() {
			return Schema.number().step(.01).min(0).max(1).role("slider");
		};
		Schema.date = function date() {
			return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
				const date = new Date(value);
				if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
				return date;
			}, true)]);
		};
		Schema.regExp = function regExp(flag = "") {
			return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
				try {
					return new RegExp(value, flag);
				} catch (e) {
					throw new ValidationError(e.message, options);
				}
			}, true)]);
		};
		Schema.arrayBuffer = function arrayBuffer(encoding) {
			return Schema.union([
				Schema.is(ArrayBuffer),
				Schema.is(SharedArrayBuffer),
				Schema.transform(Schema.any(), (value, options) => {
					if (Binary.isSource(value)) return Binary.fromSource(value);
					throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
				}, true),
				...encoding ? [Schema.transform(Schema.string(), (value, options) => {
					try {
						return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
					} catch (e) {
						throw new ValidationError(e.message, options);
					}
				}, true)] : []
			]);
		};
		Schema.extend("lazy", (data, schema, options, strict) => {
			if (!schema.inner[kSchema]) {
				schema.inner = schema.builder();
				schema.inner.meta = {
					...schema.meta,
					...schema.inner.meta
				};
			}
			return Schema.resolve(data, schema.inner, options, strict);
		});
		Schema.extend("any", (data) => {
			return [data];
		});
		Schema.extend("never", (data, _, options) => {
			throw new ValidationError(`expected nullable but got ${data}`, options);
		});
		Schema.extend("const", (data, { value }, options) => {
			if (deepEqual(data, value)) return [value];
			throw new ValidationError(`expected ${value} but got ${data}`, options);
		});
		function checkWithinRange(data, meta, description, options, skipMin = false) {
			const { max = Infinity, min = -Infinity } = meta;
			if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
			if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
		}
		Schema.extend("string", (data, { meta }, options) => {
			if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
			if (meta.pattern) {
				const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
				if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
			}
			checkWithinRange(data.length, meta, "string length", options);
			return [data];
		});
		function decimalShift(data, digits) {
			const str = data.toString();
			if (str.includes("e")) return data * Math.pow(10, digits);
			const index = str.indexOf(".");
			if (index === -1) return data * Math.pow(10, digits);
			const frac = str.slice(index + 1);
			const integer = str.slice(0, index);
			if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
			return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
		}
		function isMultipleOf(data, min, step) {
			step = Math.abs(step);
			if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
			const index = step.toString().indexOf(".");
			const digits = step.toString().slice(index + 1).length;
			return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
		}
		Schema.extend("number", (data, { meta }, options) => {
			if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
			checkWithinRange(data, meta, "number", options);
			const { step } = meta;
			if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
			return [data];
		});
		Schema.extend("boolean", (data, _, options) => {
			if (typeof data === "boolean") return [data];
			throw new ValidationError(`expected boolean but got ${data}`, options);
		});
		Schema.extend("bitset", (data, { bits, meta }, options) => {
			let value = 0, keys = [];
			if (typeof data === "number") {
				value = data;
				for (const key in bits) if (data & bits[key]) keys.push(key);
			} else if (Array.isArray(data)) {
				keys = data;
				for (const key of keys) {
					if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
					if (key in bits) value |= bits[key];
				}
			} else throw new ValidationError(`expected number or array but got ${data}`, options);
			if (value === meta.default) return [value];
			return [value, keys];
		});
		Schema.extend("function", (data, _, options) => {
			if (typeof data === "function") return [data];
			throw new ValidationError(`expected function but got ${data}`, options);
		});
		Schema.extend("is", (data, { constructor }, options) => {
			if (typeof constructor === "function") {
				if (data instanceof constructor) return [data];
				throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
			} else {
				if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
				let prototype = Object.getPrototypeOf(data);
				while (prototype) {
					if (prototype.constructor?.name === constructor) return [data];
					prototype = Object.getPrototypeOf(prototype);
				}
				throw new ValidationError(`expected ${constructor} but got ${data}`, options);
			}
		});
		function property(data, key, schema, options) {
			try {
				const [value, adapted] = Schema.resolve(data[key], schema, {
					...options,
					path: [...options.path || [], key]
				});
				if (adapted !== void 0) data[key] = adapted;
				return value;
			} catch (e) {
				if (!options?.autofix) throw e;
				delete data[key];
				return schema.meta.default;
			}
		}
		Schema.extend("array", (data, { inner, meta }, options) => {
			if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
			checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
			return [data.map((_, index) => property(data, index, inner, options))];
		});
		Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
			if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
			const result = {};
			for (const key in data) {
				let rKey;
				try {
					rKey = Schema.resolve(key, sKey, options)[0];
				} catch (error) {
					if (strict) continue;
					throw error;
				}
				result[rKey] = property(data, key, inner, options);
				data[rKey] = data[key];
				if (key !== rKey) delete data[key];
			}
			return [result];
		});
		Schema.extend("tuple", (data, { list }, options, strict) => {
			if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
			const result = list.map((inner, index) => property(data, index, inner, options));
			if (strict) return [result];
			result.push(...data.slice(list.length));
			return [result];
		});
		function merge(result, data) {
			for (const key in data) {
				if (key in result) continue;
				result[key] = data[key];
			}
		}
		Schema.extend("object", (data, { dict }, options, strict) => {
			if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
			const result = {};
			for (const key in dict) {
				const value = property(data, key, dict[key], options);
				if (!isNullable(value) || key in data) result[key] = value;
			}
			if (!strict) merge(result, data);
			return [result];
		});
		Schema.extend("union", (data, { list, toString }, options, strict) => {
			const messages = [];
			for (const inner of list) try {
				return Schema.resolve(data, inner, options, strict);
			} catch (error) {
				messages.push(error);
			}
			throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		});
		Schema.extend("intersect", (data, { list, toString }, options, strict) => {
			if (!list.length) return [data];
			let result;
			for (const inner of list) {
				const value = Schema.resolve(data, inner, options, true)[0];
				if (isNullable(value)) continue;
				if (isNullable(result)) result = value;
				else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
				else if (typeof value === "object") merge(result ??= {}, value);
				else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
			}
			if (!strict && isPlainObject(data)) merge(result, data);
			return [result];
		});
		Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
			const [result, adapted = data] = Schema.resolve(data, inner, options, true);
			if (preserve) return [callback(result)];
			else return [callback(result), callback(adapted)];
		});
		const formatters = {};
		function defineMethod(name, keys, format) {
			formatters[name] = format;
			Object.assign(Schema, { [name](...args) {
				const schema = new Schema({ type: name });
				keys.forEach((key, index) => {
					switch (key) {
						case "sKey":
							schema.sKey = args[index] ?? Schema.string();
							break;
						case "inner":
							schema.inner = Schema.from(args[index]);
							break;
						case "list":
							schema.list = args[index].map(Schema.from);
							break;
						case "dict":
							schema.dict = mapValues(args[index], Schema.from);
							break;
						case "bits":
							schema.bits = {};
							for (const key in args[index]) {
								if (typeof args[index][key] !== "number") continue;
								schema.bits[key] = args[index][key];
							}
							break;
						case "callback": {
							const callback = schema.callback = args[index];
							callback["toJSON"] ||= () => callback.toString();
							break;
						}
						case "constructor": {
							const constructor = schema.constructor = args[index];
							if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
							break;
						}
						default: schema[key] = args[index];
					}
				});
				if (name === "object" || name === "dict") schema.meta.default = {};
				else if (name === "array" || name === "tuple") schema.meta.default = [];
				else if (name === "bitset") schema.meta.default = 0;
				return schema;
			} });
		}
		defineMethod("is", ["constructor"], ({ constructor }) => {
			if (typeof constructor === "function") return constructor.name;
			else return constructor;
		});
		defineMethod("any", [], () => "any");
		defineMethod("never", [], () => "never");
		defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
		defineMethod("string", [], () => "string");
		defineMethod("number", [], () => "number");
		defineMethod("boolean", [], () => "boolean");
		defineMethod("bitset", ["bits"], () => "bitset");
		defineMethod("function", [], () => "function");
		defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
		defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
		defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
		defineMethod("object", ["dict"], ({ dict }) => {
			if (Object.keys(dict).length === 0) return "{}";
			return `{ ${Object.entries(dict).map(([key, inner]) => {
				return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
			}).join(", ")} }`;
		});
		defineMethod("union", ["list"], ({ list }, inline) => {
			const result = list.map(({ toString: format }) => format()).join(" | ");
			return inline ? `(${result})` : result;
		});
		defineMethod("intersect", ["list"], ({ list }) => {
			return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
		});
		defineMethod("transform", [
			"inner",
			"callback",
			"preserve"
		], ({ inner }, isInner) => inner.toString(isInner));
		//#endregion
		//#region src/config.ts
		const Config = Schema.object({
			enabled: Schema.boolean().default(true),
			requestTimeoutMs: Schema.natural().min(1e3).max(3e5).default(12e4)
		});
		/** Validate defaults also for direct non-Loader composition. */
		function resolveConfig(config = {}) {
			const enabled = config.enabled ?? true, requestTimeoutMs = config.requestTimeoutMs ?? 12e4;
			if (typeof enabled !== "boolean" || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1e3 || requestTimeoutMs > 3e5) throw new Error("MEMORY_SETTINGS_CONFIG");
			return {
				enabled,
				requestTimeoutMs
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Native slot, locale and private transport dependencies. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/** Register one project memory settings section without adding a session mode. */
		function apply(ctx, config = {}) {
			const resolved = resolveConfig(config);
			if (!resolved.enabled) return;
			const namespace = "settings.sepMemory";
			ctx.effect(() => ctx.locale.register(namespace, {
				zh,
				en
			}), "memory settings dictionaries");
			const t = ctx.locale.bind(namespace);
			const connection = ctx.get("connection");
			const injected = {
				api: createMemorySettingsApi(connection.rpc),
				requestTimeoutMs: resolved.requestTimeoutMs,
				hooks: { connection: connection.generation }
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "sep-memory",
				order: 35,
				label: () => t("title"),
				locale: namespace,
				inject: () => injected
			}, MemorySettingsSection));
		}
		//#endregion
		exports.Config = Config;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map