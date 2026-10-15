window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-settings-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:./AssessmentSettingsSection.module.css.mjs
		const css$2 = ".RkYznG_section{width:100%;min-width:0;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;font-size:14px;line-height:22px;display:flex}.RkYznG_heading,.RkYznG_switch{justify-content:space-between;align-items:center;gap:16px;display:flex}.RkYznG_section h2{margin:0;font-size:20px}.RkYznG_section p,.RkYznG_section h3{margin:0}.RkYznG_section p{color:var(--dsw-alias-label-secondary)}.RkYznG_section button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);cursor:pointer;border-radius:8px;align-self:flex-start;padding:7px 12px}.RkYznG_section :disabled{opacity:.55}.RkYznG_section :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}.RkYznG_section dl{grid-template-columns:minmax(0,1fr) minmax(0,auto);gap:6px 16px;margin:0;display:grid}.RkYznG_section dd{min-width:0;margin:0}.RkYznG_section details{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;min-width:0;padding:12px}.RkYznG_section summary{cursor:pointer}.RkYznG_section p,.RkYznG_section dd,.RkYznG_section li,.RkYznG_section code{overflow-wrap:anywhere}.RkYznG_switch input{flex-shrink:0}.RkYznG_section ul{max-height:360px;padding-inline-start:24px;overflow:auto}@media (width<=480px){.RkYznG_heading{align-items:flex-start}.RkYznG_section dl{grid-template-columns:1fr}.RkYznG_section dd{margin-bottom:8px}}";
		const tagId$2 = "@deepseek-ai/dsh-client-ui-settings-memory/AssessmentSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-memory";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var AssessmentSettingsSection_module_css_default = {
			"heading": "RkYznG_heading",
			"section": "RkYznG_section",
			"switch": "RkYznG_switch"
		};
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/AssessmentSettingsSection.tsx
		/** Saved state owns the switch; uncertain writes are read back without retrying a paid task. */
		function AssessmentSettingsSection({ api, requestTimeoutMs, useConnection, t }) {
			const id = (0, react.useId)(), generation = useConnection((v) => v), [state, setState] = (0, react.useState)(null), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(false), [refresh, setRefresh] = (0, react.useState)(0);
			const operation = (0, react.useRef)(null), mounted = (0, react.useRef)(true), writing = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
					operation.current?.abort();
				};
			}, []);
			(0, react.useEffect)(() => {
				if (writing.current) return;
				const controller = new AbortController();
				operation.current?.abort();
				operation.current = controller;
				const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeoutMs)]);
				api.get(signal).then((value) => {
					if (!controller.signal.aborted && mounted.current) {
						setState(value);
						setError(false);
					}
				}, () => {
					if (!controller.signal.aborted && mounted.current) setError(true);
				});
				const timer = setTimeout(() => setRefresh((v) => v + 1), 5e3);
				return () => {
					controller.abort();
					clearTimeout(timer);
				};
			}, [
				api,
				generation,
				refresh,
				requestTimeoutMs
			]);
			const mutate = async (enabled) => {
				if (writing.current) return;
				writing.current = true;
				setBusy(true);
				operation.current?.abort();
				const controller = new AbortController();
				operation.current = controller;
				const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeoutMs)]);
				try {
					const value = enabled === void 0 ? await api.retry(signal) : await api.update(enabled, signal);
					if (mounted.current) {
						setState(value);
						setError(false);
					}
				} catch {
					if (mounted.current) setError(true);
				} finally {
					writing.current = false;
					if (mounted.current) {
						setBusy(false);
						setRefresh((v) => v + 1);
					}
				}
			};
			const latest = state?.latest, usage = state?.usage, rediscoveryRequired = latest?.reason === "ASSESSMENT_REDISCOVERY_REQUIRED";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: AssessmentSettingsSection_module_css_default.section,
				"aria-labelledby": id,
				"aria-busy": busy,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AssessmentSettingsSection_module_css_default.heading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id,
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy,
							onClick: () => setRefresh((v) => v + 1),
							children: t("refresh")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: AssessmentSettingsSection_module_css_default.switch,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("enabled") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							role: "switch",
							"aria-label": t("enabled"),
							"aria-describedby": id + "-cost",
							checked: state?.enabled ?? false,
							disabled: busy || !state?.available || error,
							onChange: (e) => void mutate(e.currentTarget.checked)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						id: id + "-cost",
						children: t("costHelp")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("stopHelp") }),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: t("error")
					}) : state && !state.available ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("unavailable")
					}) : null,
					latest ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("target") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: latest.target }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("analysis") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t(latest.analysis) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("review") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t(latest.review) })
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							role: "status",
							children: [
								t(latest.phase),
								" · ",
								t(latest.status)
							]
						}),
						rediscoveryRequired ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: t("rediscoveryRequired")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("result") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("model") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: latest.summary }),
							latest.reason ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: latest.reason }) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("runtime") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: latest.plugins.map((p, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
								p.name,
								" ",
								p.version,
								" — ",
								t(p.verdict),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								p.reasons.map((reason) => t(reason)).join("；")
							] }, p.name + ":" + i)) })
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy || !state?.enabled || latest.phase === "running" || rediscoveryRequired || error,
							onClick: () => void mutate(),
							children: t("retry")
						})
					] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("none") }),
					usage ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("input") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: usage.reportedRequests ? usage.promptTokens : t("unreported") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("output") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: usage.reportedRequests ? usage.completionTokens : t("unreported") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("estimate") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: usage.reportedRequests ? usage.estimatedCny.toFixed(6) : t("unreported") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("reserved") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: usage.reservedCny.toFixed(6) })
					] })] }) : null,
					state?.available && !usage ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("accountingUnavailable")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("notInvoice") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("notInstallable") })
				]
			});
		}
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/assessment-api.ts
		function invalid$2() {
			throw new Error("ASSESSMENT_RESPONSE");
		}
		function object(v) {
			if (v === null || typeof v !== "object" || Array.isArray(v)) return invalid$2();
			return v;
		}
		function string(v, max = 8e3) {
			if (typeof v !== "string" || v.length > max) return invalid$2();
			return v;
		}
		function number(v) {
			if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return invalid$2();
			return v;
		}
		function status(v) {
			if (v === "pass" || v === "fail" || v === "blocked" || v === "not_run") return v;
			return invalid$2();
		}
		function phase(v) {
			if (v === "detected" || v === "running" || v === "complete" || v === "interrupted") return v;
			return invalid$2();
		}
		function verdict(v) {
			if (v === "unknown" || v === "compatible" || v === "incompatible") return v;
			return invalid$2();
		}
		function reasons(raw) {
			if (raw === void 0) return ["runtime"];
			if (!Array.isArray(raw) || raw.length > 4) return invalid$2();
			return raw.map((v) => {
				switch (v) {
					case "NO_CANDIDATE": return "noCandidate";
					case "STATIC_INCOMPATIBLE": return "staticIncompatible";
					case "RUNTIME_UNVERIFIED": return "runtime";
					case "BOUND_RUNTIME_EVIDENCE": return "boundEvidence";
					default: return invalid$2();
				}
			});
		}
		function parse(raw) {
			const v = object(raw);
			if (v.version !== 1 || typeof v.available !== "boolean" || typeof v.enabled !== "boolean") return invalid$2();
			let latest = null, usage = null;
			if (v.latest !== null) {
				const r = object(v.latest), input = object(r.input), release = object(input.release), a = object(r.analysis), b = object(r.review);
				if (!Array.isArray(input.plugins) || input.plugins.length > 1e4) return invalid$2();
				const summaries = [a.summary, b.summary].filter((x) => x !== void 0).map((x) => string(x, 4e3));
				if (b.conflicts !== void 0) {
					if (!Array.isArray(b.conflicts) || b.conflicts.length > 30) return invalid$2();
					summaries.push(...b.conflicts.map((x) => string(x, 1e3)));
				}
				latest = {
					target: string(release.version, 80),
					status: status(r.status),
					phase: phase(r.phase),
					analysis: status(a.status),
					review: status(b.status),
					summary: summaries.join("\n"),
					reason: r.reason === void 0 || r.reason === null ? null : string(r.reason, 100),
					plugins: input.plugins.map((value) => {
						const p = object(value);
						return {
							name: string(p.name, 214),
							version: string(p.version, 100),
							verdict: verdict(p.verdict),
							reasons: reasons(p.reasonCodes)
						};
					})
				};
			}
			if (v.usage !== null) {
				const u = object(v.usage);
				if (u.isProviderInvoice !== false) return invalid$2();
				const input = number(u.promptTokens), output = number(u.completionTokens), reportedRequests = number(u.reportedRequests);
				if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || !Number.isSafeInteger(reportedRequests)) return invalid$2();
				usage = {
					reportedRequests,
					promptTokens: input,
					completionTokens: output,
					estimatedCny: number(u.estimatedCny),
					reservedCny: number(u.reservedCny),
					isProviderInvoice: false
				};
			}
			return {
				version: 1,
				available: v.available,
				enabled: v.enabled,
				latest,
				usage
			};
		}
		/** Bounded typed projection prevents malformed wire results from becoming compatibility or cost claims. */
		function createAssessmentApi(rpc) {
			const call = async (method, payload, signal) => {
				const result = await rpc.call("/api", "sep-assessment/" + method, payload, signal);
				if (!result.ok) throw new Error("ASSESSMENT_UNAVAILABLE");
				return parse(result.value);
			};
			return {
				get: (signal) => call("get", {}, signal),
				update: (enabled, signal) => call("update", { enabled }, signal),
				retry: (signal) => call("retry", {}, signal)
			};
		}
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/assessment-locales.ts
		const zh$2 = {
			rediscoveryRequired: "需要重新检查官方更新；历史评估和用量记录会保留",
			noCandidate: "缺少目标候选依赖清单与隔离验证，无法判断兼容",
			staticIncompatible: "静态依赖约束不满足或绑定验证未通过；具体条目保留在现有全插件兼容性报告",
			boundEvidence: "已有与候选绑定的证据；本次模型评估没有新增运行验证",
			unreported: "尚未报告",
			accountingUnavailable: "暂时无法读取预算用量；不代表没有消费",
			title: "官方 DSH 更新适配评估",
			enabled: "发现官方新版本时自动评估并复核",
			costHelp: "版本查询本身不消耗模型 token。启用后，后台适配分析和独立复核都会消耗输入／输出 token，并可能产生费用；消耗取决于更新规模及插件数量，受现有共享预算护栏约束。复核会产生额外消耗，不承诺固定费用。",
			stopHelp: "关闭后不再发起新的模型请求；已启动调用有界收尾并如实结算。已有消费和预留不会清空，预算不会提高。",
			refresh: "刷新状态",
			retry: "手动重试评估及复核",
			target: "最近目标版本",
			analysis: "适配分析",
			review: "证据复核",
			result: "结果详情",
			none: "尚未发现待评估的新版本",
			notInstallable: "评估通过不代表全面兼容、已生成适配包或可以安装。安装仍须通过现有候选、指纹确认、停写、备份和风险审阅门禁。",
			usage: "实际已报告用量",
			input: "输入 token",
			output: "输出 token",
			estimate: "估算费用（元）",
			reserved: "未结算预留（元）",
			notInvoice: "费用为本地估算，不是供应商账单。结果未知的调用保留预留；未报告用量不按零消耗推断。",
			unavailable: "评估服务不可用，请检查 SEP 与预算服务",
			error: "操作结果未确认，请刷新读取已保存状态",
			pass: "通过",
			fail: "失败",
			blocked: "阻断",
			not_run: "未运行",
			running: "执行中",
			complete: "已结束",
			detected: "已发现",
			interrupted: "已中断",
			unknown: "未知／未运行验证",
			incompatible: "确认不兼容",
			compatible: "已有绑定验证证据",
			runtime: "本次未执行插件运行验证",
			model: "模型判断（不是运行验证）"
		};
		const en$2 = {
			rediscoveryRequired: "Check official updates again to continue assessment. Existing results and usage are retained.",
			noCandidate: "No target candidate dependency inventory or isolated verification is available",
			staticIncompatible: "Static dependency constraints or bound verification failed; the existing full plugin compatibility report retains the detailed evidence",
			boundEvidence: "Candidate-bound evidence already exists; this model assessment adds no runtime verification",
			unreported: "Not reported",
			accountingUnavailable: "Budget usage is currently unavailable; this does not mean no spending occurred",
			title: "Official DSH upgrade assessment",
			enabled: "Automatically assess and review newly discovered official versions",
			costHelp: "Version queries use no model tokens. Background adaptation analysis and independent review both consume input/output tokens and may incur charges. Usage depends on update size and plugin count and remains subject to existing shared budget guards. Review adds usage; no fixed cost is promised.",
			stopHelp: "Turning this off prevents new model requests. Started calls finish within bounds and remain accounted for. Spending and reservations are retained; budgets are never raised.",
			refresh: "Refresh status",
			retry: "Manually retry analysis and review",
			target: "Latest target version",
			analysis: "Adaptation analysis",
			review: "Evidence review",
			result: "Result details",
			none: "No new version detected for assessment",
			notInstallable: "Passing assessment does not mean full compatibility, a generated adaptation package, or installation permission. Existing candidate, fingerprint, write-stop, backup and risk-review requirements still apply.",
			usage: "Actual reported usage",
			input: "Input tokens",
			output: "Output tokens",
			estimate: "Estimated cost (CNY)",
			reserved: "Unsettled reservations (CNY)",
			notInvoice: "Costs are local estimates, not provider invoices. Unknown outcomes retain reservations; missing usage is not treated as zero spending.",
			unavailable: "Assessment service unavailable; check SEP and its budget service",
			error: "The outcome is unconfirmed. Refresh to read saved state",
			pass: "Pass",
			fail: "Fail",
			blocked: "Blocked",
			not_run: "Not run",
			running: "Running",
			complete: "Finished",
			detected: "Detected",
			interrupted: "Interrupted",
			unknown: "Unknown / no runtime verification",
			incompatible: "Confirmed incompatible",
			compatible: "Bound verification evidence exists",
			runtime: "No plugin runtime verification performed in this assessment",
			model: "Model judgment (not runtime verification)"
		};
		//#endregion
		//#region \0dsh-css:./BudgetSettingsSection.module.css.mjs
		const css$1 = ".-uEoMq_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;font-size:14px;line-height:22px;display:flex}.-uEoMq_heading{justify-content:space-between;align-items:center;gap:12px;display:flex}.-uEoMq_heading h2{margin:0;font-size:20px}.-uEoMq_section p{margin:0}.-uEoMq_box{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;gap:10px;padding:16px;display:grid}.-uEoMq_section input,.-uEoMq_section select,.-uEoMq_section button{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);box-sizing:border-box;border-radius:8px;min-width:0;max-width:100%;padding:7px 12px}.-uEoMq_section input{width:100%;max-width:280px}.-uEoMq_section button{cursor:pointer;justify-self:start}.-uEoMq_section :disabled{opacity:.55;cursor:wait}.-uEoMq_section :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}.-uEoMq_notice,.-uEoMq_box p,.-uEoMq_section small{color:var(--dsw-alias-label-tertiary);font-size:13px}.-uEoMq_section code{overflow-wrap:anywhere;font-size:12px}.-uEoMq_section dl{grid-template-columns:1fr auto;gap:5px 20px;margin:0;display:grid}.-uEoMq_section dd{text-align:right;margin:0}.-uEoMq_section label{font-weight:600}@media (width<=480px){.-uEoMq_box{padding:12px}.-uEoMq_section dl{grid-template-columns:1fr}.-uEoMq_section dd{text-align:left}}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-settings-memory/BudgetSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-memory";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var BudgetSettingsSection_module_css_default = {
			"box": "-uEoMq_box",
			"heading": "-uEoMq_heading",
			"notice": "-uEoMq_notice",
			"section": "-uEoMq_section"
		};
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/BudgetSettingsSection.tsx
		function ledgerNotice(error) {
			if (!(error instanceof Error)) return null;
			return error.message === "BUDGET_LEDGER_MISSING" ? "ledgerMissing" : error.message === "BUDGET_LEDGER_CHANGED" ? "ledgerChanged" : null;
		}
		function parseLimit(input) {
			if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;
			const value = Number(input);
			return Number.isFinite(value) && value >= .01 && value <= 1e6 ? value : null;
		}
		function money(value) {
			return value.toLocaleString(void 0, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 6
			});
		}
		/** Bounded waiting never implies a timed-out mutation was not committed. */
		function request$1(fn, parent, timeout) {
			const controller = new AbortController();
			let timer;
			return new Promise((resolve, reject) => {
				const abort = () => {
					controller.abort();
					cleanup();
					reject(/* @__PURE__ */ new Error("ABORTED"));
				};
				const cleanup = () => {
					clearTimeout(timer);
					parent.removeEventListener("abort", abort);
				};
				parent.addEventListener("abort", abort, { once: true });
				timer = setTimeout(() => {
					controller.abort();
					cleanup();
					reject(/* @__PURE__ */ new Error("TIMEOUT"));
				}, timeout);
				if (parent.aborted) {
					abort();
					cleanup();
					return;
				}
				Promise.resolve().then(() => fn(controller.signal)).then((value) => {
					cleanup();
					resolve(value);
				}, (error) => {
					cleanup();
					reject(error);
				});
			});
		}
		/** Defaults and window overrides are independent CAS writes; reads are authoritative. */
		function BudgetSettingsSection({ api, requestTimeoutMs, useConnection, t }) {
			const id = (0, react.useId)(), generation = useConnection((value) => value);
			const [catalog, setCatalog] = (0, react.useState)(null), [snapshot, setSnapshot] = (0, react.useState)(null);
			const [sessionId, setSessionId] = (0, react.useState)(""), [refresh, setRefresh] = (0, react.useState)(0), [loading, setLoading] = (0, react.useState)(true), [saving, setSaving] = (0, react.useState)(false);
			const [defaultInput, setDefaultInput] = (0, react.useState)("100"), [limitInput, setLimitInput] = (0, react.useState)("100"), [notice, setNotice] = (0, react.useState)(null);
			const [confirmedAt, setConfirmedAt] = (0, react.useState)(null);
			const pending = (0, react.useRef)(false), mounted = (0, react.useRef)(true), read = (0, react.useRef)(null), write = (0, react.useRef)(null), selection = (0, react.useRef)("");
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
					read.current?.abort();
					write.current?.abort();
				};
			}, []);
			(0, react.useEffect)(() => {
				if (pending.current) return;
				const controller = new AbortController();
				read.current?.abort();
				read.current = controller;
				setLoading(true);
				setSnapshot(null);
				setCatalog(null);
				(async () => {
					try {
						const list = await request$1((signal) => api.list(signal), controller.signal, requestTimeoutMs);
						if (controller.signal.aborted) return;
						const selected = list.sessions.some((value) => value.id === selection.current) ? selection.current : list.sessions[0]?.id ?? "";
						const value = list.available && selected ? await request$1((signal) => api.get(selected, signal), controller.signal, requestTimeoutMs) : null;
						if (controller.signal.aborted) return;
						selection.current = selected;
						setSessionId(selected);
						setCatalog(list);
						setSnapshot(value);
						setDefaultInput(String(list.available ? list.defaults.limitCny : 100));
						setLimitInput(String(value?.limitCny ?? (list.available ? list.defaults.limitCny : 100)));
						setConfirmedAt(Date.now());
					} catch (error) {
						if (!controller.signal.aborted) {
							setCatalog(null);
							setSnapshot(null);
							setNotice(ledgerNotice(error) ?? "readError");
						}
					} finally {
						if (!controller.signal.aborted) setLoading(false);
					}
				})();
				return () => controller.abort();
			}, [
				api,
				generation,
				refresh,
				requestTimeoutMs
			]);
			async function save(isDefault) {
				const value = parseLimit(isDefault ? defaultInput : limitInput);
				if (pending.current || loading || !catalog?.available || value === null || !isDefault && !snapshot) return;
				pending.current = true;
				setSaving(true);
				setNotice(null);
				read.current?.abort();
				const controller = new AbortController();
				write.current = controller;
				const selected = snapshot?.rootSessionId, revision = isDefault ? catalog.defaults.revision : snapshot.revision;
				try {
					await request$1((signal) => isDefault ? api.updateDefault(value, revision, signal) : api.update(selected, value, revision, signal), controller.signal, requestTimeoutMs);
					if (mounted.current && !controller.signal.aborted) setNotice("saved");
				} catch (error) {
					if (mounted.current && !controller.signal.aborted) setNotice(ledgerNotice(error) ?? (error instanceof Error && error.message === "BUDGET_SETTINGS_CONFLICT" ? "conflict" : "unconfirmed"));
				} finally {
					pending.current = false;
					if (mounted.current) {
						setSaving(false);
						setRefresh((value) => value + 1);
					}
				}
			}
			const disabled = loading || saving, defaultValue = parseLimit(defaultInput), sessionValue = parseLimit(limitInput);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: BudgetSettingsSection_module_css_default.section,
				"aria-busy": disabled,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: BudgetSettingsSection_module_css_default.heading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setNotice(null);
								setRefresh((value) => value + 1);
							},
							disabled: saving,
							children: t("refresh")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("description") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: BudgetSettingsSection_module_css_default.notice,
						children: t("notInvoice")
					}),
					notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: notice === "saved" ? "status" : "alert",
						children: t(notice)
					}) : null,
					loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("loading")
					}) : null,
					!loading && catalog && !catalog.available ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						role: "status",
						children: [
							t("unavailable"),
							" ",
							catalog.reason
						]
					}) : null,
					catalog?.available ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: BudgetSettingsSection_module_css_default.box,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: id + "-default",
									children: t("defaultLimit")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: id + "-default",
									name: "defaultLimit",
									type: "number",
									min: "0.01",
									max: "1000000",
									step: "0.01",
									value: defaultInput,
									onChange: (event) => setDefaultInput(event.target.value),
									disabled
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("defaultHelp") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("range") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: disabled || defaultValue === null || defaultValue === catalog.defaults.limitCny,
									onClick: () => void save(true),
									children: t("saveDefault")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: BudgetSettingsSection_module_css_default.box,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: id + "-session",
									children: t("session")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									id: id + "-session",
									value: sessionId,
									disabled: disabled || !catalog.sessions.length,
									onChange: (event) => {
										selection.current = event.target.value;
										setSessionId(event.target.value);
										setNotice(null);
										setRefresh((value) => value + 1);
									},
									children: catalog.sessions.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: item.id,
										children: item.label
									}, item.id))
								}),
								!catalog.sessions.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noSessions") }) : null,
								snapshot ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: snapshot.rootSessionId }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(snapshot.usesDefault ? "usesDefault" : "override") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										htmlFor: id + "-limit",
										children: t("sessionLimit")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: id + "-limit",
										name: "sessionLimit",
										type: "number",
										min: "0.01",
										max: "1000000",
										step: "0.01",
										value: limitInput,
										onChange: (event) => setLimitInput(event.target.value),
										disabled
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										disabled: disabled || sessionValue === null || sessionValue === snapshot.limitCny && !snapshot.usesDefault,
										onClick: () => void save(false),
										children: t("saveSession")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("accounted") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["¥ ", money(snapshot.accountedUpperBoundCny)] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("settled") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["¥ ", money(snapshot.settledCny)] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("reserved") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["¥ ", money(snapshot.reservedCny)] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("remaining") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["¥ ", money(snapshot.remainingCny)] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("unattributed") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: ["¥ ", money(snapshot.unattributedSharedCny)] })
									] })
								] }) : null
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: BudgetSettingsSection_module_css_default.box,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									t("sharedGuard"),
									": ¥ ",
									money(catalog.shared.limitCny),
									" · ",
									t("remaining"),
									": ¥ ",
									money(catalog.shared.remainingCny)
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									t("taskGuard"),
									": ¥ ",
									money(catalog.taskLimitCny)
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("independent") })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: BudgetSettingsSection_module_css_default.notice,
							children: t("retained")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: BudgetSettingsSection_module_css_default.notice,
							children: t("unknown")
						}),
						confirmedAt ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
							t("confirmed"),
							": ",
							new Date(confirmedAt).toLocaleString()
						] }) : null
					] }) : null
				]
			});
		}
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/budget-api.ts
		const codes = new Set([
			"BUDGET_SETTINGS_CONFLICT",
			"BUDGET_SETTINGS_SESSION",
			"BUDGET_SETTINGS_INPUT",
			"BUDGET_SETTINGS_UNAVAILABLE",
			"BUDGET_LEDGER_MISSING",
			"BUDGET_LEDGER_CHANGED",
			"BUDGET_LOCKED",
			"ABORTED",
			"DISPOSED"
		]);
		const safe = (value) => typeof value === "string" && codes.has(value) ? value : "BUDGET_SETTINGS_UNAVAILABLE";
		function record$1(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		const amount = (value) => typeof value === "number" && Number.isFinite(value);
		const nonnegative = (value) => amount(value) && value >= 0;
		const limit = (value) => amount(value) && value >= .01 && value <= 1e6 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
		const revision = (value) => Number.isSafeInteger(value) && value >= 0;
		const text$1 = (value) => typeof value === "string" && value.length > 0 && value.length <= 4096;
		function invalid$1() {
			throw new Error("BUDGET_SETTINGS_RESPONSE");
		}
		function defaults(value) {
			if (!record$1(value) || !limit(value.limitCny) || !revision(value.revision)) return invalid$1();
			return value;
		}
		function snapshot$1(value, sessionId) {
			if (!record$1(value) || value.version !== 1 || value.rootSessionId !== sessionId || !limit(value.limitCny) || !revision(value.revision) || typeof value.usesDefault !== "boolean" || value.isProviderInvoice !== false || !amount(value.remainingCny) || ![
				"accountedUpperBoundCny",
				"settledCny",
				"reservedCny",
				"unattributedSharedCny"
			].every((key) => nonnegative(value[key]))) return invalid$1();
			return value;
		}
		function list(value) {
			if (!record$1(value) || value.version !== 1 || typeof value.available !== "boolean" || !(value.reason === null || typeof value.reason === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.reason))) return invalid$1();
			if (!value.available) {
				if (!Array.isArray(value.sessions) || value.sessions.length !== 0) return invalid$1();
				return {
					version: 1,
					available: false,
					reason: value.reason,
					sessions: []
				};
			}
			if (!record$1(value.shared) || !nonnegative(value.shared.limitCny) || !nonnegative(value.shared.accountedUpperBoundCny) || !amount(value.shared.remainingCny) || !nonnegative(value.taskLimitCny) || !Array.isArray(value.sessions) || value.sessions.length > 1e4) return invalid$1();
			defaults(value.defaults);
			const ids = /* @__PURE__ */ new Set();
			for (const row of value.sessions) {
				if (!record$1(row) || !text$1(row.id) || !text$1(row.label) || ids.has(row.id)) return invalid$1();
				ids.add(row.id);
			}
			return value;
		}
		function createBudgetSettingsApi(rpc) {
			const call = async (method, payload, signal) => {
				const result = await rpc.call("/api", "sep-budget/" + method, payload, signal);
				if (!result.ok) throw new Error(safe(result.error.message));
				return result.value;
			};
			return {
				list: async (signal) => list(await call("list", {}, signal)),
				get: async (sessionId, signal) => snapshot$1(await call("get", { sessionId }, signal), sessionId),
				update: async (sessionId, limitCny, expectedRevision, signal) => snapshot$1(await call("update", {
					sessionId,
					limitCny,
					expectedRevision
				}, signal), sessionId),
				updateDefault: async (limitCny, expectedRevision, signal) => defaults(await call("updateDefault", {
					limitCny,
					expectedRevision
				}, signal))
			};
		}
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/budget-locales.ts
		const zh$1 = {
			title: "会话预算",
			refresh: "刷新",
			description: "为每个会话窗口设置累计金额安全护栏。默认 100 元，可调整默认值，或为指定会话单独设置。主任务和归属于它的子代理共同计入该会话。",
			notInvoice: "这是 SEP 的本地估算与预留额度，不是 DeepSeek 账户余额，也不是提供方账单。",
			defaultLimit: "默认单会话上限（元）",
			defaultHelp: "修改默认值会影响尚未单独设置上限的会话。已产生的消费和预留不会清零。",
			range: "可设置 0.01 至 1,000,000 元，最多两位小数。",
			saveDefault: "保存默认上限",
			session: "会话窗口",
			noSessions: "尚无可管理的根会话。",
			sessionLimit: "此会话累计上限（元）",
			saveSession: "保存此会话上限",
			usesDefault: "此会话当前使用默认上限。",
			override: "此会话已使用独立上限，不随默认值变化。",
			accounted: "累计计入金额",
			settled: "已结算估算",
			reserved: "未结预留",
			remaining: "剩余可用额度",
			unattributed: "仅计入共享总账的旧／未归属金额",
			sharedGuard: "共享总预算上限",
			taskGuard: "单轮任务上限",
			independent: "三项护栏独立生效。即使将会话上限设为 200 元，请求仍可能被共享总预算剩余额度或单轮上限拦截。设置低于已计入金额后，后续新请求会受限；已发出的请求仍需结算。",
			retained: "保存只调整护栏。历史消费、子代理归属和未结预留均保留。",
			unknown: "结果未知的请求仍占用预留；无法归属旧消费只计入共享总账，不猜测分配给某个会话。",
			confirmed: "上次读取时间",
			loading: "正在读取已保存的设置…",
			unavailable: "预算设置暂不可用。",
			ledgerMissing: "预算账本缺失，已阻止新的模型请求。请恢复并核验原账本，不能清零重建。刷新不会自动重建账本。",
			ledgerChanged: "预算账本在操作期间发生变化，已拒绝本次写入。请核验原账本并刷新；不会自动重复保存或清零消费。",
			readError: "读取失败，旧值已隐藏。请刷新后再修改。",
			unconfirmed: "保存结果未确认，已尝试重新读取。不会自动重复提交；请核对已保存值。",
			conflict: "设置已被其他操作修改，已重新读取。请核对后再保存。",
			saved: "设置已保存，正在核对最新值。"
		};
		const en$1 = {
			title: "Session budget",
			refresh: "Refresh",
			description: "Set a cumulative spending guard for each session window. The default is CNY 100. Override an individual session or change the default. Attributed child agents share the root session guard.",
			notInvoice: "These are local SEP estimates and reservations, not your DeepSeek account balance or provider invoice.",
			defaultLimit: "Default session limit (CNY)",
			defaultHelp: "Changing the default affects sessions without an override. Existing usage and reservations are retained.",
			range: "Enter CNY 0.01–1,000,000, with at most two decimal places.",
			saveDefault: "Save default limit",
			session: "Session window",
			noSessions: "No managed root sessions yet.",
			sessionLimit: "This session cumulative limit (CNY)",
			saveSession: "Save session limit",
			usesDefault: "This session currently uses the default.",
			override: "This session has an independent limit.",
			accounted: "Total accounted amount",
			settled: "Settled estimate",
			reserved: "Unsettled reservations",
			remaining: "Remaining allowance",
			unattributed: "Legacy / unattributed amount in shared ledger only",
			sharedGuard: "Shared budget limit",
			taskGuard: "Per-turn task limit",
			independent: "All three guards apply independently. A CNY 200 session limit can still be blocked by the shared balance or per-turn limit. Lowering a guard below accounted usage blocks new requests; dispatched requests still need settlement.",
			retained: "Saving only changes the guard. Historical usage, child attribution and unsettled reservations remain intact.",
			unknown: "Unknown outcomes retain reservations. Legacy unattributed spending stays in the shared ledger and is not guessed into a session.",
			confirmed: "Last read",
			loading: "Reading saved settings…",
			unavailable: "Budget settings unavailable.",
			ledgerMissing: "The budget ledger is missing. New model requests are blocked. Restore and verify the original ledger; do not reset it to zero. Refresh does not recreate the ledger.",
			ledgerChanged: "The budget ledger changed during this operation. This write was rejected. Verify the original ledger and refresh; saving will not be retried automatically or reset usage.",
			readError: "Read failed. Stale values are hidden; refresh before editing.",
			unconfirmed: "Save outcome is unconfirmed. A readback was attempted without repeating the mutation. Check the saved values.",
			conflict: "Another operation changed these settings. State was reloaded; review before saving.",
			saved: "Settings saved; checking the latest values."
		};
		//#endregion
		//#region \0dsh-css:./MemorySettingsSection.module.css.mjs
		const css = ".mjlTFa_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;font-size:14px;line-height:22px;display:flex}.mjlTFa_heading{justify-content:space-between;align-items:center;gap:12px;display:flex}.mjlTFa_heading h2{margin:0;font-size:20px;line-height:28px}.mjlTFa_section p{margin:0}.mjlTFa_description,.mjlTFa_row small{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.mjlTFa_project{gap:8px;display:grid}.mjlTFa_project code{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font-size:12px}.mjlTFa_section button,.mjlTFa_project select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:6px 12px}.mjlTFa_section button{cursor:pointer}.mjlTFa_section button:disabled,.mjlTFa_project select:disabled,.mjlTFa_section input:disabled{opacity:.55;cursor:wait}.mjlTFa_section button:focus-visible,.mjlTFa_project select:focus-visible,.mjlTFa_section input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}.mjlTFa_master,.mjlTFa_row label{justify-content:space-between;align-items:center;gap:16px;display:flex}.mjlTFa_master{padding-top:4px;font-weight:600}.mjlTFa_section input{width:22px;height:22px;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer;flex-shrink:0}.mjlTFa_controls{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;gap:16px;padding:12px 16px;display:grid}.mjlTFa_row{gap:5px;display:grid}.mjlTFa_notice{border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);padding-top:14px;font-size:13px;line-height:20px}.mjlTFa_error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}@media (width<=480px){.mjlTFa_controls{padding:12px}.mjlTFa_heading{align-items:flex-start}}";
		const tagId = "@deepseek-ai/dsh-client-ui-settings-memory/MemorySettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-memory";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var MemorySettingsSection_module_css_default = {
			"controls": "mjlTFa_controls",
			"description": "mjlTFa_description",
			"error": "mjlTFa_error",
			"heading": "mjlTFa_heading",
			"master": "mjlTFa_master",
			"notice": "mjlTFa_notice",
			"project": "mjlTFa_project",
			"row": "mjlTFa_row",
			"section": "mjlTFa_section"
		};
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/MemorySettingsSection.tsx
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
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/errors.ts
		const PUBLIC_CODES = new Set([
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
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/api.ts
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
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/locales.ts
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
		//#region ../../../../dsh-020rc2-20260929/upstream/vendor/cosmokit/src/misc.ts
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
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/vendor/cosmokit/src/volatile.ts
		/** Shared config references used by schema validators and plugin runtimes. */
		const write = Symbol.for("cosmokit.volatile.write");
		function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
			if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
			if (value === null || typeof value !== "object") return value;
			if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
			ancestors.add(value);
			try {
				if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
				if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
				return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
			} finally {
				ancestors.delete(value);
			}
		}
		/**
		* Create a detached reference containing an immutable copy of the supplied data.
		* @param value - validated config data; class instances and functions are unsupported.
		* @returns a reference whose value is updated only by its owning runtime.
		*/
		function createVolatile(value) {
			let current = snapshot(value);
			return Object.freeze({
				get: () => current,
				[write]: (value) => {
					current = value;
				}
			});
		}
		/**
		* Identify references across ESM/CJS copies of the shared library.
		* @param value - a parsed config value.
		* @returns whether the value implements the shared reference protocol.
		*/
		function isVolatile(value) {
			return typeof value === "object" && value !== null && write in value;
		}
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/vendor/cosmokit/src/types.ts
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
		let Binary;
		(function(_Binary) {
			_Binary.is = isArrayBufferLike;
			_Binary.isSource = isArrayBufferSource;
			function fromSource(source) {
				if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
				else return source;
			}
			_Binary.fromSource = fromSource;
			function toBase64(source) {
				source = fromSource(source);
				if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
				let binary = "";
				const bytes = new Uint8Array(source);
				for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
				return btoa(binary);
			}
			_Binary.toBase64 = toBase64;
			function fromBase64(source) {
				if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
				return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
			}
			_Binary.fromBase64 = fromBase64;
			function toHex(source) {
				source = fromSource(source);
				if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
				return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
			}
			_Binary.toHex = toHex;
			function fromHex(source) {
				if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
				const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
				const buffer = [];
				for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
				return Uint8Array.from(buffer).buffer;
			}
			_Binary.fromHex = fromHex;
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
		/**
		* Compare values recursively, treating two volatile references as equal regardless of value.
		* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
		* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
		* @param a - first value.
		* @param b - second value.
		* @param strict - whether to require strict data equality outside volatile references.
		* @returns whether the values compare equal.
		*/
		function deepEqual(a, b, strict) {
			const ancestors = /* @__PURE__ */ new Set();
			function compare(a, b) {
				if (a === b) return true;
				if (isVolatile(a) || isVolatile(b)) return isVolatile(a) && isVolatile(b);
				if (!strict && isNullable(a) && isNullable(b)) return true;
				if (typeof a !== typeof b || typeof a !== "object" || !a || !b) return false;
				if (ancestors.has(a)) return false;
				function check(test, then) {
					return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
				}
				ancestors.add(a);
				try {
					return check(Array.isArray, (a, b) => {
						if (a.length !== b.length) return false;
						for (let index = 0; index < a.length; index++) if (!compare(a[index], b[index])) return false;
						return true;
					}) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("URL"), (a, b) => a.href === b.href) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
						if (a.byteLength !== b.byteLength) return false;
						const viewA = new Uint8Array(a);
						const viewB = new Uint8Array(b);
						for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
						return true;
					}) ?? ((!strict || [a, b].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
						...a,
						...b
					}).every((key) => compare(a[key], b[key])));
				} finally {
					ancestors.delete(a);
				}
			}
			return compare(a, b);
		}
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/vendor/cosmokit/src/time.ts
		let Time;
		(function(_Time) {
			_Time.millisecond = 1;
			const second = _Time.second = 1e3;
			const minute = _Time.minute = second * 60;
			const hour = _Time.hour = minute * 60;
			const day = _Time.day = hour * 24;
			const week = _Time.week = day * 7;
			let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
			function setTimezoneOffset(offset) {
				timezoneOffset = offset;
			}
			_Time.setTimezoneOffset = setTimezoneOffset;
			function getTimezoneOffset() {
				return timezoneOffset;
			}
			_Time.getTimezoneOffset = getTimezoneOffset;
			function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
				if (typeof date === "number") date = new Date(date);
				if (offset === void 0) offset = timezoneOffset;
				return Math.floor((date.valueOf() / minute - offset) / 1440);
			}
			_Time.getDateNumber = getDateNumber;
			function fromDateNumber(value, offset) {
				const date = new Date(value * day);
				if (offset === void 0) offset = timezoneOffset;
				return new Date(+date + offset * minute);
			}
			_Time.fromDateNumber = fromDateNumber;
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
				return (parseFloat(capture[1]) * week || 0) + (parseFloat(capture[2]) * day || 0) + (parseFloat(capture[3]) * hour || 0) + (parseFloat(capture[4]) * minute || 0) + (parseFloat(capture[5]) * second || 0);
			}
			_Time.parseTime = parseTime;
			function parseDate(date) {
				const parsed = parseTime(date);
				if (parsed) date = Date.now() + parsed;
				else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
				else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
				return date ? new Date(date) : /* @__PURE__ */ new Date();
			}
			_Time.parseDate = parseDate;
			function format(ms) {
				const abs = Math.abs(ms);
				if (abs >= day - hour / 2) return Math.round(ms / day) + "d";
				else if (abs >= hour - minute / 2) return Math.round(ms / hour) + "h";
				else if (abs >= minute - second / 2) return Math.round(ms / minute) + "m";
				else if (abs >= second) return Math.round(ms / second) + "s";
				return ms + "ms";
			}
			_Time.format = format;
			function toDigits(source, length = 2) {
				return source.toString().padStart(length, "0");
			}
			_Time.toDigits = toDigits;
			function template(template, time = /* @__PURE__ */ new Date()) {
				return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
			}
			_Time.template = template;
		})(Time || (Time = {}));
		//#endregion
		//#region ../../../../dsh-020rc2-20260929/upstream/vendor/schemastery/lib/index.mjs
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
			if (isVolatile(value)) value = value.get();
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
		Schema.prototype.volatile = function volatile() {
			if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
			return this.extra("volatile", true);
		};
		const resolvers = {};
		const checkedVolatile = Symbol("checked-volatile-schema");
		function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
			const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
			if (states.has(blocked)) return;
			states.add(blocked);
			seen.set(schema, states);
			if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
			const nested = blocked || !!schema.meta?.volatile;
			if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
			if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
			if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
			if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
		}
		Schema.extend = function extend(type, resolve) {
			resolvers[type] = resolve;
		};
		Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
			if (!schema) return [data];
			if (!options[checkedVolatile]) {
				validateVolatileSchema(schema, options.path);
				options = {
					...options,
					[checkedVolatile]: true
				};
			}
			if (schema.meta?.volatile) {
				const inner = Schema(schema);
				inner.meta = {
					...schema.meta,
					volatile: false
				};
				const [value, adapted] = Schema.resolve(data, inner, options, strict);
				try {
					return [createVolatile(value), adapted];
				} catch (error) {
					throw new ValidationError(error instanceof Error ? error.message : String(error), options);
				}
			}
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
				validateVolatileSchema(schema.inner, options.path, true);
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
				return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
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
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/config.ts
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
		//#region ../../../../dsh-020rc2-20260929/upstream/packages/client/ui-settings-memory/src/client/index.ts
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
			const assessmentNamespace = "settings.sepAssessment";
			ctx.effect(() => ctx.locale.register(assessmentNamespace, {
				zh: zh$2,
				en: en$2
			}), "update assessment dictionaries");
			const assessmentT = ctx.locale.bind(assessmentNamespace);
			const assessmentInjected = {
				api: createAssessmentApi(connection.rpc),
				requestTimeoutMs: resolved.requestTimeoutMs,
				hooks: { connection: connection.generation }
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "sep-assessment",
				order: 37,
				label: () => assessmentT("title"),
				locale: assessmentNamespace,
				inject: () => assessmentInjected
			}, AssessmentSettingsSection));
			const budgetNamespace = "settings.sepBudget";
			ctx.effect(() => ctx.locale.register(budgetNamespace, {
				zh: zh$1,
				en: en$1
			}), "budget settings dictionaries");
			const budgetT = ctx.locale.bind(budgetNamespace);
			const budgetInjected = {
				api: createBudgetSettingsApi(connection.rpc),
				requestTimeoutMs: resolved.requestTimeoutMs,
				hooks: { connection: connection.generation }
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "sep-budget",
				order: 36,
				label: () => budgetT("title"),
				locale: budgetNamespace,
				inject: () => budgetInjected
			}, BudgetSettingsSection));
		}
		//#endregion
		exports.Config = Config;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map