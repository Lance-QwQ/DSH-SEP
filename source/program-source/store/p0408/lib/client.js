window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-sidebar-documentpreview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react_dom = require("react-dom");
		//#region ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region ../../util/workspace-path/lib/index.js
		/**
		* The `dsh-resource://file/…` address grammar: how a file is named across the
		* Sidebar and the resource model, built and parsed without touching a
		* filesystem.
		* @module
		*/
		/** The scheme and type every file address opens with. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Whether a decoded first path segment is a Windows drive (`C:`). */
		function isDriveSegment(segment) {
			return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
		}
		/**
		* Read a file address back into its parts without resolving `.` or `..`.
		* Query and fragment suffixes are ignored; encoded path segments are decoded.
		* @param address - a candidate address.
		* @returns the parts, or `undefined` when the string is not a `dsh-resource://file/` URI in a known scope with a path, or a segment is not validly encoded.
		*/
		function parseFileAddress(address) {
			try {
				if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
				const end = address.search(/[?#]/);
				const [scope, ...rest] = address.slice(20, end === -1 ? void 0 : end).split("/");
				if (scope === "session") {
					const [id, ...segments] = rest;
					if (id === void 0 || id === "" || segments.length === 0) return void 0;
					return {
						scope,
						sessionId: decodeURIComponent(id),
						path: segments.map(decodeURIComponent).join("/")
					};
				}
				if (scope === "absolute") {
					const unc = rest[0] === "" && rest.length > 1;
					const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
					if (segments.length === 0 || segments[0] === "") return void 0;
					if (unc) return {
						scope,
						path: `//${segments.join("/")}`
					};
					return {
						scope,
						path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}`
					};
				}
				return;
			} catch {
				return;
			}
		}
		/**
		* Split a path for display: the directories through their last separator, and
		* the final segment after it. Both `/` and `\` separate, so a Windows path
		* splits where its own segments end; trailing separators are dropped first, so
		* a directory path names its own last segment. A path with no separator, or a
		* separator-only path, is all name.
		* @param path - file or directory path using POSIX or Windows separators.
		* @returns the directory prefix (possibly empty) and the final segment.
		*/
		function pathPartsOf(path) {
			const trimmed = path.replace(/[/\\]+$/, "");
			if (trimmed === "") return {
				directory: "",
				name: path
			};
			const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1;
			return {
				directory: trimmed.slice(0, cut),
				name: trimmed.slice(cut)
			};
		}
		//#endregion
		//#region lib/types/client/failure-line.js
		/** Render a byte count the way a person reads one. */
		function humanBytes(bytes) {
			if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
			if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
			return `${bytes} B`;
		}
		/**
		* Say what went wrong, in terms of the file rather than of the transport.
		* @param t - namespace-bound translate.
		* @param failure - the settled Remote failure.
		* @returns the line to show in place of the file.
		*/
		function failureLine(t, failure) {
			switch (failure.code) {
				case "workspace-file/not-found": return t("error.notFound");
				case "workspace-file/too-large": return t("error.tooLarge", { limit: humanBytes(failure.details.limit) });
				case "workspace-file/not-text": return t("error.notText");
				case "workspace-file/not-regular-file": return t("error.notRegularFile");
				default: return t("error.unavailable", { message: failure.message });
			}
		}
		//#endregion
		//#region lib/types/client/icons.js
		/** Two margin bars, a straight arrow running to the right one: lines run past the edge. */
		const IconNowrapFill16 = ({ size = 16, className }) => (0, react_jsx_runtime.jsx)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 24 24",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: (0, react_jsx_runtime.jsx)("path", {
				d: "M1.5 2.5H3.5V21.5H1.5V2.5ZM20.5 2.5H22.5V21.5H20.5V2.5ZM14 9L19 12L14 15V13H5V11H14V9Z",
				fill: "currentColor"
			})
		});
		/** Two margin bars, an arrow sweeping around and back left: lines turn under themselves. */
		const IconWrapFill16 = ({ size = 16, className }) => (0, react_jsx_runtime.jsx)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 24 24",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: (0, react_jsx_runtime.jsx)("path", {
				d: "M1.5 2.5H3.5V21.5H1.5V2.5ZM20.5 2.5H22.5V21.5H20.5V2.5ZM6.75 5H11.5A6 6 0 0 1 12 16.98V19L7 16L12 13V14.97A4 4 0 0 0 11.5 7H6.75V5Z",
				fill: "currentColor"
			})
		});
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/LoadingIndicator.module.css.mjs
		const css$7 = ".tKrPPq_loading{vertical-align:middle;white-space:normal;align-items:center;gap:8px;display:inline-flex}.tKrPPq_icon{flex:none;animation:.8s linear infinite tKrPPq_turn;display:flex}@keyframes tKrPPq_turn{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.tKrPPq_icon{animation:none}}";
		const tagId$7 = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/LoadingIndicator.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$7) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId$7;
			tag.textContent = css$7;
			document.head.appendChild(tag);
		}
		var LoadingIndicator_module_css_default = {
			"icon": "tKrPPq_icon",
			"loading": "tKrPPq_loading",
			"turn": "tKrPPq_turn"
		};
		//#endregion
		//#region lib/types/client/LoadingIndicator.js
		/**
		* @param props - localized status label, carried as the accessible name with
		* no visible text, and optional placement style.
		* @returns an animated, accessible loading status.
		*/
		function LoadingIndicator({ label, className }) {
			return (0, react_jsx_runtime.jsx)("span", {
				className: clsx(LoadingIndicator_module_css_default.loading, className),
				role: "status",
				"aria-label": label,
				"data-document-loading": true,
				children: (0, react_jsx_runtime.jsx)("span", {
					className: LoadingIndicator_module_css_default.icon,
					"aria-hidden": "true",
					children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {})
				})
			});
		}
		//#endregion
		//#region lib/types/client/rpc.js
		/**
		* The session and path one `dsh-resource://file/…` address names.
		*
		* A `session` address names its own session and a relative or absolute path, so
		* a tab addressed into another session reads from that session. An `absolute`
		* address carries no session and cannot be read here. The registry routes only
		* session-scoped `file` addresses to this type, so an address `parseFileAddress`
		* rejects or that carries no session is a programming error and throws.
		* @param address - a tab's `dsh-resource://file/…` address.
		* @returns the session and the path to hand the endpoint.
		*/
		function hostFileOf(address) {
			const parsed = parseFileAddress(address);
			if (parsed?.scope !== "session") throw new Error(`ui-sidebar-documentpreview: not a session file address "${address}"`);
			return {
				sessionId: parsed.sessionId,
				path: parsed.path
			};
		}
		/**
		* Bind the paged read to one Remote face. The page length is the Host's
		* configured cap, so no `limit` travels.
		* @param remote - the Client Remote carrying the `workspaceFiles` namespace.
		* @returns the read the face performs.
		*/
		function createReadPage(remote) {
			return (sessionId, path, offset, signal) => remote.workspaceFiles.read(sessionId, path, { offset }, signal);
		}
		/**
		* Decode one successful Remote byte result for document renderers.
		* @param file - Host byte result with base64 data.
		* @returns the same metadata with native bytes; malformed base64 throws.
		*/
		function documentFileBytes(file) {
			const binary = atob(file.data);
			const data = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
			return {
				...file,
				data
			};
		}
		//#endregion
		//#region lib/types/client/document/suffix.js
		/**
		* Filename suffix matching shared by the preview registry and the owner's
		* unviewable list, so every consumer normalizes paths and suffixes alike.
		*/
		/**
		* Normalize one declared suffix for comparison.
		* @param extension - declared file suffix, with or without a leading dot.
		* @returns the suffix lowercased with any leading dot dropped.
		*/
		function normalizeSuffix(extension) {
			return extension.toLowerCase().replace(/^\./u, "");
		}
		/**
		* The filename a path's suffixes are matched against.
		* @param path - decoded filename or file path; `\` is accepted as a separator.
		* @returns the lowercased final path segment.
		*/
		function documentFileName(path) {
			const normalized = path.replaceAll("\\", "/").toLowerCase();
			return normalized.slice(normalized.lastIndexOf("/") + 1);
		}
		/**
		* The longest declared suffix ending the filename.
		* @param name - lowercased filename from {@link documentFileName}.
		* @param extensions - declared suffixes; compound suffixes such as `tar.gz` are accepted.
		* @returns the matched suffix's normalized length, or 0 when none matches.
		*/
		function matchedSuffixLength(name, extensions) {
			return Math.max(0, ...extensions.map(normalizeSuffix).filter((extension) => name.endsWith(`.${extension}`)).map((extension) => extension.length));
		}
		//#endregion
		//#region lib/types/client/document/registry.js
		/** File-extension preview registrations; component dispatch belongs to the keyed document slot. */
		/**
		* Rank an observed definition snapshot without consulting mutable service state.
		* @param definitions - registered implementations in registration order.
		* @param path - decoded filename or file path.
		* @returns matching implementations, external band first, then longest suffix.
		*/
		function matchingDocumentPreviews(definitions, path) {
			const name = documentFileName(path);
			return definitions.map((definition, order) => ({
				definition,
				order,
				rank: definition.priority === "builtin" ? 0 : 1,
				length: matchedSuffixLength(name, definition.extensions)
			})).filter((candidate) => candidate.length > 0).sort((left, right) => right.rank - left.rank || right.length - left.length || left.order - right.order).map((candidate) => candidate.definition);
		}
		/**
		* Whether any registered implementation declares the filename's suffix binary.
		* @param definitions - registered implementations.
		* @param path - decoded filename or file path.
		* @returns true when a declared binary suffix matches the filename.
		*/
		function binaryDocumentPath(definitions, path) {
			const name = documentFileName(path);
			return definitions.some((definition) => matchedSuffixLength(name, definition.binaryExtensions ?? []) > 0);
		}
		/** Observable registry of all live implementations, including lower-priority alternatives. */
		var DocumentPreviewRegistry = class {
			registered = /* @__PURE__ */ new Map();
			listeners = /* @__PURE__ */ new Set();
			snapshot = [];
			/**
			* Read the current registrations.
			* @returns the same snapshot until a registration changes.
			*/
			getSnapshot = () => this.snapshot;
			/**
			* Observe registration changes.
			* @param listener - registration-change observer.
			* @returns its disposer.
			*/
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/**
			* Register metadata separately from the matching keyed slot component.
			* @param definition - unique implementation and recognized suffixes; every
			* `binaryExtensions` entry must appear in `extensions`.
			* @returns an idempotent disposer; duplicate live implementation names and
			* binary suffixes outside `extensions` throw.
			*/
			register(definition) {
				if (this.registered.has(definition.id)) throw new Error(`documentPreviews: duplicate implementation "${definition.id}"`);
				const declared = new Set(definition.extensions.map(normalizeSuffix));
				for (const extension of definition.binaryExtensions ?? []) if (!declared.has(normalizeSuffix(extension))) throw new Error(`documentPreviews: "${definition.id}" declares binary suffix "${extension}" outside its extensions`);
				this.registered.set(definition.id, definition);
				this.publish();
				let active = true;
				return () => {
					if (!active) return;
					active = false;
					this.registered.delete(definition.id);
					this.publish();
				};
			}
			/**
			* List every matching implementation in automatic-selection order.
			* @param path - decoded file path; matching never resolves filesystem access.
			* @returns extension band first, then longest suffix, then registration order.
			*/
			candidates(path) {
				return matchingDocumentPreviews(this.snapshot, path);
			}
			publish() {
				this.snapshot = [...this.registered.values()];
				(0, _deepseek_ai_dsh_client_store.notifySubscribers)(this.listeners, "[document-previews] registry");
			}
		};
		//#endregion
		//#region lib/types/client/document/unviewable.js
		/**
		* Known binary container suffixes with no registered renderer. The preview
		* owner shows these the unsupported empty state instead of the plain-text
		* fallback; any renderer registration for a suffix takes precedence because
		* the owner consults this list only when no implementation matches. A suffix
		* belongs here only when its bytes are never readable text — an uncertain
		* suffix stays out and keeps the plain-text fallback.
		*/
		const UNVIEWABLE_BINARY_EXTENSIONS = [
			"mp4",
			"mov",
			"avi",
			"mkv",
			"webm",
			"flv",
			"wmv",
			"m4v",
			"mp3",
			"wav",
			"flac",
			"ogg",
			"m4a",
			"aac",
			"wma",
			"opus",
			"zip",
			"gz",
			"tgz",
			"bz2",
			"xz",
			"zst",
			"7z",
			"rar",
			"tar",
			"jar",
			"doc",
			"docx",
			"xls",
			"xlsx",
			"ppt",
			"pptx",
			"odt",
			"ods",
			"odp",
			"pages",
			"numbers",
			"exe",
			"dll",
			"so",
			"dylib",
			"bin",
			"o",
			"class",
			"pyc",
			"wasm",
			"ttf",
			"otf",
			"woff",
			"woff2",
			"eot",
			"dmg",
			"iso",
			"img",
			"sqlite",
			"db",
			"psd",
			"ai",
			"sketch",
			"tiff",
			"tif",
			"heic",
			"heif",
			"avif"
		];
		/**
		* Whether a filename's suffix is a known binary container that no renderer claims.
		* @param path - decoded filename or file path.
		* @returns true when the suffix belongs to the unviewable binary list.
		*/
		function unviewableBinaryPath(path) {
			return matchedSuffixLength(documentFileName(path), UNVIEWABLE_BINARY_EXTENSIONS) > 0;
		}
		//#endregion
		//#region lib/types/client/text/lines.js
		/**
		* Split a loaded page into its source lines.
		* @param page - source page.
		* @returns its lines, preserving one empty line but excluding a zero-line page.
		*/
		function linesOf(page) {
			return page.lines === 0 ? [] : page.text.split("\n");
		}
		/**
		* Order loaded pages by source position.
		* @param pages - stored page table.
		* @returns pages in source order.
		*/
		function loadedPages(pages) {
			return Object.entries(pages).map(([offset, page]) => ({
				offset: Number(offset),
				...page
			})).sort((left, right) => left.offset - right.offset);
		}
		/**
		* Find the end of the loaded source prefix.
		* @param pages - ordered pages.
		* @returns the last loaded source line, or zero.
		*/
		function lastLineLoaded(pages) {
			const last = pages.at(-1);
			return last === void 0 ? 0 : last.offset + last.lines - 1;
		}
		/**
		* Reveal a plain-text or highlighted source line.
		* @param body - scrolling document body or code-content viewport.
		* @param line - 1-based source line to reveal.
		* @returns Whether the current renderer exposes that line.
		*/
		function scrollToLine(body, line) {
			const innerCode = body.hasAttribute("data-code-block-content");
			const plain = body.querySelector(`[data-textpreview-line="${line}"]`);
			const code = innerCode ? body.querySelectorAll("pre .line").item(line - 1) : null;
			const row = plain ?? code;
			if (!(row instanceof HTMLElement)) return false;
			body.scrollTop = Math.max(0, row.offsetTop);
			return true;
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/TextPreview.module.css.mjs
		const css$6 = ".dhJKeW_preview{flex-direction:column;flex:auto;height:100%;min-height:0;display:flex}.dhJKeW_header{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l3);flex:none;align-items:center;gap:4px;height:38px;padding:0 6px 0 16px;display:flex}.dhJKeW_path{white-space:nowrap;flex:auto;justify-content:flex-end;min-width:0;margin-right:12px;font-size:12px;display:flex;overflow:hidden}.dhJKeW_path[data-textpreview-path-clipped]{mask-image:linear-gradient(90deg,#0000,#000 28px)}.dhJKeW_pathText{flex:none;margin-right:auto}.dhJKeW_pathDirectory{color:var(--dsw-alias-label-tertiary)}.dhJKeW_pathName{color:var(--dsw-alias-label-primary)}.dhJKeW_changed{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:10px;margin:0;padding:6px 10px;font-size:12px;display:flex}.dhJKeW_body{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);min-height:0;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);font-family:var(--dsw-font-mono,ui-monospace, monospace);white-space:pre;flex:auto;margin:0;padding:0;line-height:1.6;position:relative;overflow:auto}.dhJKeW_body::-webkit-scrollbar-track{margin:2px}.dhJKeW_body:has([data-code-preview]){flex-direction:column;display:flex;overflow:hidden}.dhJKeW_body:has([data-pdf-preview]){background:var(--dsw-alias-bg-document-preview)}.dhJKeW_wrap{white-space:pre-wrap;word-break:break-word}.dhJKeW_textDocument{box-sizing:border-box;min-width:100%;min-height:100%;padding:8px}.dhJKeW_page{font:var(--dsw-font-markdown-code-block);white-space:inherit;margin:0}.dhJKeW_line{padding:0 10px}.dhJKeW_lineTarget{background:var(--dsw-alias-interactive-bg-hover)}.dhJKeW_empty{box-sizing:border-box;height:100%;color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size-secondary,13px);font-family:var(--dsw-font-family);text-align:center;white-space:normal;flex-direction:column;justify-content:center;align-items:center;gap:16px;padding:0 24px;line-height:1.6;display:flex}.dhJKeW_empty:after{content:\"\";flex:0 12%}.dhJKeW_emptyIcon{opacity:.6;filter:grayscale();flex:none}.dhJKeW_emptyLine{margin:0}.dhJKeW_retry{height:32px;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);border:.5px solid var(--dsw-alias-border-l2);cursor:pointer;background:0 0;border-radius:16px;flex:none;align-items:center;gap:6px;padding:0 14px 0 12px;font-family:inherit;display:inline-flex}.dhJKeW_retry:hover{background:var(--dsw-alias-interactive-bg-hover)}.dhJKeW_titleIcon{flex:none}.dhJKeW_statusLine{color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size-secondary,13px);white-space:normal;align-items:center;gap:10px;margin:0;padding:6px 10px;line-height:1.6;display:flex}.dhJKeW_status{box-sizing:border-box;flex-direction:column;justify-content:center;align-items:center;gap:8px;height:100%;padding:12px 10px;display:flex}.dhJKeW_bodyLoading{box-sizing:border-box;justify-content:center;width:100%;height:100%}.dhJKeW_action{color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);font-family:var(--dsw-font,inherit);white-space:normal;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);cursor:pointer;border-radius:6px;padding:4px 10px}.dhJKeW_action:hover{background:var(--dsw-alias-bg-layer-3)}.dhJKeW_more{color:var(--dsw-alias-label-secondary);font-size:12px;font-family:var(--dsw-font,inherit);white-space:normal;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);cursor:pointer;border-radius:6px;margin:8px 10px;padding:4px 10px;display:block}.dhJKeW_more:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}.dhJKeW_more:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.dhJKeW_tool{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:28px;flex:none;justify-content:center;align-items:center;padding:6px;line-height:1;display:inline-flex}.dhJKeW_tool svg{width:15px;height:15px}.dhJKeW_tool:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.dhJKeW_viewerTool{width:auto;max-width:160px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;flex:none;padding:0 6px;font-size:12px;overflow:hidden}";
		const tagId$6 = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/TextPreview.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId$6;
			tag.textContent = css$6;
			document.head.appendChild(tag);
		}
		var TextPreview_module_css_default = {
			"action": "dhJKeW_action",
			"body": "dhJKeW_body",
			"bodyLoading": "dhJKeW_bodyLoading",
			"changed": "dhJKeW_changed",
			"empty": "dhJKeW_empty",
			"emptyIcon": "dhJKeW_emptyIcon",
			"emptyLine": "dhJKeW_emptyLine",
			"header": "dhJKeW_header",
			"line": "dhJKeW_line",
			"lineTarget": "dhJKeW_lineTarget",
			"more": "dhJKeW_more",
			"page": "dhJKeW_page",
			"path": "dhJKeW_path",
			"pathDirectory": "dhJKeW_pathDirectory",
			"pathName": "dhJKeW_pathName",
			"pathText": "dhJKeW_pathText",
			"preview": "dhJKeW_preview",
			"retry": "dhJKeW_retry",
			"status": "dhJKeW_status",
			"statusLine": "dhJKeW_statusLine",
			"textDocument": "dhJKeW_textDocument",
			"titleIcon": "dhJKeW_titleIcon",
			"tool": "dhJKeW_tool",
			"viewerTool": "dhJKeW_viewerTool",
			"wrap": "dhJKeW_wrap"
		};
		//#endregion
		//#region lib/types/client/text/TextBody.js
		/** @param props - document contents and standard tab information. @returns source lines with navigation targets. */
		function TextBody({ content, useTabInfo }) {
			const { tab } = useTabInfo();
			const params = tab.navigation.params;
			const target = params !== void 0 && "line" in params ? params.line : void 0;
			if (content.kind !== "text") return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: TextPreview_module_css_default.textDocument,
				"data-textpreview-plain": true,
				children: content.pages.map((page) => (0, react_jsx_runtime.jsx)("pre", {
					className: TextPreview_module_css_default.page,
					"data-textpreview-page": page.offset,
					children: linesOf(page).map((text, index) => {
						const number = page.offset + index;
						return (0, react_jsx_runtime.jsxs)("div", {
							className: clsx(TextPreview_module_css_default.line, number === target && TextPreview_module_css_default.lineTarget),
							"data-textpreview-line": number,
							...number === target ? { "data-textpreview-target": number } : {},
							children: [text, "\n"]
						}, number);
					})
				}, page.offset))
			});
		}
		//#endregion
		//#region lib/types/client/text/index.js
		/** Stable plain-text implementation identity within this package. */
		const PLAIN_BODY_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text";
		/**
		* Describe the plain-text fallback.
		* @param title - locale-owned implementation name.
		* @returns plain-text registration metadata.
		*/
		function textBodyDefinition(title) {
			return {
				id: PLAIN_BODY_ID,
				extensions: [],
				priority: "builtin",
				title,
				loading: "text-pages",
				wrap: true
			};
		}
		/** @param ctx - owning plugin context. Register the fallback metadata and keyed body. */
		function apply$7(ctx) {
			const t = ctx.locale.bind("sidebarDocumentPreview");
			ctx.effect(() => ctx.documentPreviews.register(textBodyDefinition(() => t("viewer.text"))));
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: PLAIN_BODY_ID
			}, TextBody)));
		}
		//#endregion
		//#region lib/types/client/TextPreview.js
		/**
		* The text preview's body: a file's content, or the reason it is not showing.
		*
		* Two sources meet here. The standard `useResource` hook gives the file's
		* metadata — its version — and this type's
		* own store holds the content it read through its face. A Host-reported change is
		* announced, not applied: reloading under a reader would lose their place, so
		* the bar waits for a click. A failed metadata frame — the file gone, its
		* workspace unknown — takes the same bar's place over the pages already loaded,
		* with the same reload. The type's controls, viewer choice, wrap and reload, sit at the end of
		* the path row; the Sidebar's strip carries none of them.
		*/
		/** Keep the path fade in sync with whether its full text fits the header row. */
		function usePathClipped(box, text, path, shown) {
			(0, react.useLayoutEffect)(() => {
				const outer = box.current;
				const inner = text.current;
				if (outer === null || inner === null) return void 0;
				const apply = () => {
					if (inner.offsetWidth > outer.clientWidth) outer.dataset.textpreviewPathClipped = "";
					else delete outer.dataset.textpreviewPathClipped;
				};
				apply();
				const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(apply);
				observer?.observe(outer);
				observer?.observe(inner);
				return () => {
					observer?.disconnect();
				};
			}, [
				box,
				text,
				path,
				shown
			]);
		}
		/** The header's path: directories greyed, the final segment in full ink, faded when clipped. */
		function HeaderPath({ pathRef, pathTextRef, path }) {
			const { directory, name } = pathPartsOf(path);
			return (0, react_jsx_runtime.jsx)("div", {
				ref: pathRef,
				className: TextPreview_module_css_default.path,
				title: path,
				"data-textpreview-path": true,
				children: (0, react_jsx_runtime.jsxs)("span", {
					ref: pathTextRef,
					className: TextPreview_module_css_default.pathText,
					children: [directory !== "" && (0, react_jsx_runtime.jsx)("span", {
						className: TextPreview_module_css_default.pathDirectory,
						children: directory
					}), (0, react_jsx_runtime.jsx)("span", {
						className: TextPreview_module_css_default.pathName,
						children: name
					})]
				})
			});
		}
		/**
		* The text type's body, registered under `sidebar.right.pane.tab` as `text`.
		* @param props - composed slot props.
		* @returns the content read so far with its controls, or a progress line.
		*/
		function TextPreview({ useTabInfo, useResource, useStore, actions, loadPage, reloadPages, loadAll, reloadAll, prepareRenderer, useDocumentPreviews, renderSlot, t }) {
			const { tab } = useTabInfo();
			const { navigation, signal } = tab;
			const meta = useResource(tab.contentId);
			const canRead = meta.status !== "none";
			const file = (0, react.useMemo)(() => hostFileOf(tab.contentId), [tab.contentId]);
			const state = useStore((s) => s.byTab[tab.id]);
			const definitions = useDocumentPreviews((value) => value);
			const unviewable = (0, react.useMemo)(() => unviewableBinaryPath(file.path), [file.path]);
			const candidates = (0, react.useMemo)(() => {
				const matched = matchingDocumentPreviews(definitions, file.path);
				if (matched.length > 0 && binaryDocumentPath(definitions, file.path)) return matched;
				if (matched.length === 0 && unviewable) return matched;
				const fallback = definitions.find((definition) => definition.id === PLAIN_BODY_ID);
				return fallback === void 0 ? matched : [...matched, fallback];
			}, [
				definitions,
				file.path,
				unviewable
			]);
			const selected = candidates.find((candidate) => candidate.id === state?.rendererId) ?? candidates[0];
			const mode = selected?.loading;
			const contentRendererId = mode === "renderer" ? selected?.id : void 0;
			const current = (state?.mode ?? "text-pages") === mode && state?.contentRendererId === contentRendererId ? state : void 0;
			const bodyRef = (0, react.useRef)(null);
			const scrollportRef = (0, react.useRef)(null);
			const storedScrollTopRef = (0, react.useRef)(0);
			const pathRef = (0, react.useRef)(null);
			const pathTextRef = (0, react.useRef)(null);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const displayPath = meta.value?.absolutePath ?? current?.complete?.absolutePath ?? file.path;
			usePathClipped(pathRef, pathTextRef, displayPath, state !== void 0);
			const line = navigation.params !== void 0 && "line" in navigation.params ? navigation.params.line : void 0;
			const pages = current?.pages;
			const loaded = (0, react.useMemo)(() => loadedPages(pages ?? {}), [pages]);
			const loadedThrough = lastLineLoaded(loaded);
			const hasContent = mode === "renderer" ? current?.version !== void 0 : loaded.length > 0 || current?.complete !== void 0;
			storedScrollTopRef.current = state?.scrollTop ?? 0;
			const bindBody = (0, react.useCallback)((body) => {
				const previous = bodyRef.current;
				bodyRef.current = body;
				if (scrollportRef.current === null || scrollportRef.current === previous) scrollportRef.current = body;
			}, []);
			const bindScrollport = (0, react.useCallback)((scrollport) => {
				const next = scrollport ?? bodyRef.current;
				scrollportRef.current = next;
				if (next !== null) next.scrollTop = storedScrollTopRef.current;
			}, []);
			const started = current !== void 0;
			(0, react.useEffect)(() => {
				if (started || !canRead || mode === void 0 || selected === void 0) return;
				if (mode === "text-pages") loadPage(tab.id, file, 1, signal, meta.value?.version);
				else if (mode === "bytes-complete") loadAll(tab.id, file, signal, meta.value?.version);
				else prepareRenderer(tab.id, signal, selected.id, meta.value?.version);
			}, [
				started,
				tab.id,
				file,
				signal,
				loadPage,
				loadAll,
				prepareRenderer,
				canRead,
				mode,
				selected,
				meta.value?.version
			]);
			(0, react.useEffect)(() => {
				const body = scrollportRef.current;
				if (hasContent && body !== null && state !== void 0) body.scrollTop = state.scrollTop;
			}, [hasContent, selected?.id]);
			(0, react.useEffect)(() => {
				const body = scrollportRef.current;
				if (current === void 0 || body === null || current.revision === navigation.revision) return;
				if (line === void 0 || mode !== "text-pages") {
					actions.navigated(tab.id, navigation.revision);
					return;
				}
				if (line > loadedThrough && !current.eof) {
					if (!current.loading && current.failure === void 0 && canRead) loadPage(tab.id, file, loadedThrough + 1, signal, meta.value?.version);
					return;
				}
				if (!scrollToLine(body, line) && line <= loadedThrough) return;
				actions.navigated(tab.id, navigation.revision);
				actions.scrolled(tab.id, body.scrollTop);
			}, [
				navigation.revision,
				line,
				loadedThrough,
				current?.eof,
				current?.loading,
				current?.failure,
				started,
				selected?.id,
				mode,
				file,
				canRead,
				meta.value?.version
			]);
			const rendererReload = (0, react.useCallback)(() => {
				if (canRead && selected !== void 0) prepareRenderer(tab.id, signal, selected.id, meta.value?.version, true);
			}, [
				canRead,
				prepareRenderer,
				tab.id,
				signal,
				selected?.id,
				meta.value?.version
			]);
			const content = (0, react.useMemo)(() => {
				if (mode === "renderer") {
					if (current === void 0) return void 0;
					const revision = current.loadRevision;
					return {
						kind: "renderer",
						revision,
						reload: rendererReload,
						loaded: (version) => {
							actions.rendered(tab.id, revision, version);
						}
					};
				}
				if (mode === "bytes-complete") return current?.complete === void 0 ? void 0 : {
					kind: "bytes",
					data: current.complete.data
				};
				if (current === void 0 || loaded.length === 0) return void 0;
				return {
					kind: "text",
					pages: loaded,
					text: loaded.filter((page) => page.lines > 0).map((page) => page.text).join("\n"),
					eof: current.eof
				};
			}, [
				mode,
				loaded,
				current?.complete,
				current?.eof,
				current?.loadRevision,
				rendererReload,
				actions,
				tab.id
			]);
			if (selected === void 0 && unviewable) {
				const { name: unsupportedName } = pathPartsOf(displayPath);
				return (0, react_jsx_runtime.jsxs)("div", {
					className: TextPreview_module_css_default.preview,
					"data-textpreview-state": "unsupported",
					"data-textpreview-url": tab.contentId,
					children: [(0, react_jsx_runtime.jsx)("div", {
						className: TextPreview_module_css_default.header,
						children: (0, react_jsx_runtime.jsx)(HeaderPath, {
							pathRef,
							pathTextRef,
							path: displayPath
						})
					}), (0, react_jsx_runtime.jsx)("div", {
						className: TextPreview_module_css_default.body,
						"data-textpreview-body": true,
						children: (0, react_jsx_runtime.jsxs)("div", {
							className: TextPreview_module_css_default.empty,
							"data-textpreview-unsupported": true,
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
								kind: (0, _deepseek_ai_dsh_client_ui_primitives.classifyFileType)(unsupportedName),
								size: 36,
								className: TextPreview_module_css_default.emptyIcon
							}), (0, react_jsx_runtime.jsx)("p", {
								className: TextPreview_module_css_default.emptyLine,
								children: t("unsupportedFile")
							})]
						})
					})]
				});
			}
			if (state === void 0 || selected === void 0) return (0, react_jsx_runtime.jsx)("div", {
				className: TextPreview_module_css_default.status,
				"data-textpreview-state": "loading",
				children: meta.status === "none" ? (0, react_jsx_runtime.jsx)("p", {
					className: TextPreview_module_css_default.statusLine,
					children: t("resourceUnavailable")
				}) : (0, react_jsx_runtime.jsx)(LoadingIndicator, {
					className: TextPreview_module_css_default.statusLine,
					label: t("loading")
				})
			});
			const next = loadedThrough + 1;
			const { name } = pathPartsOf(displayPath);
			const observedVersion = meta.value?.version;
			const changed = current?.version !== void 0 && observedVersion !== void 0 && observedVersion !== current.version && observedVersion !== current.observedVersion;
			const loadNext = () => {
				if (!canRead || current?.loading || current?.eof) return;
				loadPage(tab.id, file, next, signal, meta.value?.version);
			};
			const reload = () => {
				if (!canRead) return;
				if (mode === "text-pages") reloadPages(tab.id, file, signal, meta.value?.version);
				else if (mode === "bytes-complete") reloadAll(tab.id, file, signal, meta.value?.version);
				else rendererReload();
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: TextPreview_module_css_default.preview,
				"data-textpreview-state": "text",
				"data-textpreview-url": tab.contentId,
				"data-document-preview": selected.id,
				children: [
					meta.failure !== void 0 && hasContent ? (0, react_jsx_runtime.jsxs)("p", {
						className: TextPreview_module_css_default.changed,
						"data-textpreview-meta-failed": meta.failure.code,
						children: [(0, react_jsx_runtime.jsx)("span", { children: failureLine(t, meta.failure) }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: TextPreview_module_css_default.action,
							"data-textpreview-reload-now": true,
							onClick: reload,
							children: t("reloadNow")
						})]
					}) : changed && (0, react_jsx_runtime.jsxs)("p", {
						className: TextPreview_module_css_default.changed,
						"data-textpreview-changed": true,
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("changed") }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: TextPreview_module_css_default.action,
							"data-textpreview-reload-now": true,
							onClick: reload,
							children: t("reloadNow")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: TextPreview_module_css_default.header,
						children: [
							(0, react_jsx_runtime.jsx)(HeaderPath, {
								pathRef,
								pathTextRef,
								path: displayPath
							}),
							candidates.length > 1 && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
								open: menuOpen,
								anchor: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: clsx(TextPreview_module_css_default.tool, TextPreview_module_css_default.viewerTool),
									"aria-label": t("openWith"),
									title: selected.title(),
									"data-document-viewer-menu": true,
									onClick: () => {
										setMenuOpen((value) => !value);
									},
									children: selected.title()
								}),
								items: candidates.map((candidate) => ({
									id: candidate.id,
									label: candidate.title()
								})),
								selectedId: selected.id,
								onSelect: (id) => {
									actions.selected(tab.id, id);
									setMenuOpen(false);
								},
								onClose: () => {
									setMenuOpen(false);
								},
								align: "end",
								portal: true,
								dense: true
							}),
							selected.wrap === true && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t(state.wrap ? "wrap.disable" : "wrap.enable"),
								side: "bottom",
								delayMs: 500,
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: TextPreview_module_css_default.tool,
									"aria-pressed": state.wrap,
									"aria-label": t("wrap.aria"),
									"data-textpreview-tool": "wrap",
									onClick: () => {
										actions.toggledWrap(tab.id);
									},
									children: state.wrap ? (0, react_jsx_runtime.jsx)(IconNowrapFill16, {}) : (0, react_jsx_runtime.jsx)(IconWrapFill16, {})
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("reload"),
								side: "bottom",
								delayMs: 500,
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: TextPreview_module_css_default.tool,
									"aria-label": t("reload"),
									"data-textpreview-tool": "reload",
									onClick: reload,
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {})
								})
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						ref: bindBody,
						className: clsx(TextPreview_module_css_default.body, state.wrap && TextPreview_module_css_default.wrap),
						"data-textpreview-body": true,
						"data-textpreview-wrap": state.wrap ? "" : void 0,
						onScrollCapture: (event) => {
							const body = scrollportRef.current;
							/* v8 ignore next -- callback refs bind the scrollport during commit, before user input. */
							if (body === null) return;
							if (event.target !== body) return;
							actions.scrolled(tab.id, body.scrollTop);
							if (mode === "text-pages" && current?.failure === void 0 && body.clientHeight > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 1) loadNext();
						},
						children: [
							mode !== "renderer" && !hasContent && current?.failure === void 0 && (0, react_jsx_runtime.jsx)(LoadingIndicator, {
								className: clsx(TextPreview_module_css_default.statusLine, TextPreview_module_css_default.bodyLoading),
								label: t("loading")
							}),
							content !== void 0 && renderSlot("sidebar.right.tab.document", {
								resourceAddress: tab.contentId,
								content,
								wrap: state.wrap,
								scrollportRef: bindScrollport
							}, {
								entryKey: selected.id,
								hookContext: useTabInfo,
								fallback: (0, react_jsx_runtime.jsx)("p", {
									className: TextPreview_module_css_default.statusLine,
									children: t("rendererUnavailable", { name: selected.title() })
								})
							}),
							current?.failure !== void 0 && (hasContent ? (0, react_jsx_runtime.jsxs)("p", {
								className: TextPreview_module_css_default.statusLine,
								"data-textpreview-failed": current.failure.code,
								children: [(0, react_jsx_runtime.jsx)("span", { children: failureLine(t, current.failure) }), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: TextPreview_module_css_default.action,
									"data-textpreview-retry": true,
									onClick: loadNext,
									children: t("retry")
								})]
							}) : (0, react_jsx_runtime.jsxs)("div", {
								className: TextPreview_module_css_default.empty,
								"data-textpreview-failed": current.failure.code,
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
										kind: (0, _deepseek_ai_dsh_client_ui_primitives.classifyFileType)(name),
										size: 36,
										className: TextPreview_module_css_default.emptyIcon
									}),
									(0, react_jsx_runtime.jsx)("p", {
										className: TextPreview_module_css_default.emptyLine,
										children: failureLine(t, current.failure)
									}),
									(0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: TextPreview_module_css_default.retry,
										"data-textpreview-retry": true,
										onClick: reload,
										children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 }), t("retry")]
									})
								]
							})),
							mode === "text-pages" && current !== void 0 && loaded.length > 0 && !current.eof && current.failure === void 0 && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: TextPreview_module_css_default.more,
								disabled: current.loading,
								"data-textpreview-more": true,
								onClick: loadNext,
								children: current.loading ? (0, react_jsx_runtime.jsx)(LoadingIndicator, { label: t("loading") }) : t("loadMore")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/TextTitle.js
		/**
		* The title as the chip and a floating panel's header show it.
		* @param props - the tab information hook.
		* @returns the type's 16px sheet followed by the tab's title text.
		*/
		function TextTitle({ useTabInfo }) {
			const { tab } = useTabInfo();
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
				kind: (0, _deepseek_ai_dsh_client_ui_primitives.classifyFileType)(tab.title),
				size: 16,
				className: TextPreview_module_css_default.titleIcon
			}), tab.title] });
		}
		//#endregion
		//#region lib/types/client/definition.js
		/** The tab kind this package owns. */
		const TEXTPREVIEW_KIND = "text";
		/** This implementation's identity in the tab system: the key its body registers under. */
		const TEXTPREVIEW_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
		/**
		* The tab title for one `file:` address: its decoded basename.
		*
		* The whole address stays the content identity, so two files with one name in
		* different directories are two tabs; only the chip text is shortened. Decoding
		* is per segment, matching how the address was built, so a name carrying `#`,
		* `?`, or a space reads as itself.
		* @param address - a `file:`-shaped address.
		* @returns the decoded last path segment, or the address itself when it has none.
		*/
		function basenameOf(address) {
			const name = address.slice(address.lastIndexOf("/") + 1);
			if (name === "") return address;
			try {
				return decodeURIComponent(name);
			} catch {
				return name;
			}
		}
		/**
		* The text type's registry definition.
		* @returns the definition to register.
		*/
		function textDefinition() {
			return {
				id: TEXTPREVIEW_ID,
				kind: TEXTPREVIEW_KIND,
				patterns: ["dsh-resource://file/**"],
				priority: "fallback",
				canOpen: (address) => parseFileAddress(address)?.scope === "session",
				title: basenameOf
			};
		}
		//#endregion
		//#region lib/types/client/face.js
		/**
		* Bind the preview's face to one paged read and one complete-byte read.
		* @param read - the bound `workspaceFiles.read` call.
		* @param readAll - ordinary complete-byte Remote read.
		* @returns the Slot `inject` factory: bound actions in, face out. The slot's session id is unused because the address carries its own.
		*/
		function textFace(read, readAll) {
			return (_sessionId, actions) => {
				const tabs = /* @__PURE__ */ new Map();
				const readsOf = (tabId, signal) => {
					const held = tabs.get(tabId);
					if (held !== void 0) return held;
					const created = {
						generation: 0,
						version: void 0,
						mode: "text-pages"
					};
					tabs.set(tabId, created);
					signal.addEventListener("abort", () => {
						created.controller?.abort();
						tabs.delete(tabId);
						actions.forget(tabId);
					}, { once: true });
					return created;
				};
				const modeOf = (tabId, signal, mode, rendererId) => {
					const reads = readsOf(tabId, signal);
					if (reads.mode !== mode || reads.rendererId !== rendererId) {
						reads.controller?.abort();
						if (rendererId === void 0) delete reads.rendererId;
						else reads.rendererId = rendererId;
						reads.mode = mode;
						reads.generation++;
						reads.version = void 0;
						actions.reset(tabId);
					}
					return reads;
				};
				const loadPage = (tabId, file, offset, signal, observedVersion) => {
					if (signal.aborted) return;
					const reads = modeOf(tabId, signal, "text-pages");
					const { generation } = reads;
					actions.loading(tabId, "text-pages", observedVersion);
					read(file.sessionId, file.path, offset, signal).then((result) => {
						if (signal.aborted || reads.generation !== generation) return;
						if (!result.ok) {
							actions.failed(tabId, result.error);
							return;
						}
						if (offset !== 1 && reads.version !== void 0 && result.value.version !== reads.version) {
							restart(tabId, file, signal, observedVersion);
							return;
						}
						reads.version = result.value.version;
						actions.page(tabId, result.value);
					});
				};
				const loadAll = (tabId, file, signal, observedVersion) => {
					if (signal.aborted) return;
					const reads = modeOf(tabId, signal, "bytes-complete");
					reads.controller?.abort();
					const controller = new AbortController();
					reads.controller = controller;
					const lifetime = AbortSignal.any([signal, controller.signal]);
					actions.loading(tabId, "bytes-complete", observedVersion);
					readAll(file, lifetime).then((result) => {
						if (lifetime.aborted) return;
						if (!result.ok) {
							actions.failed(tabId, result.error);
							return;
						}
						const file = result.value;
						reads.version = file.version;
						actions.complete(tabId, file);
					}, (error) => {
						if (lifetime.aborted) return;
						actions.failed(tabId, Object.assign(new Error(error instanceof Error ? error.message : String(error), { cause: error }), {
							name: "RemoteError",
							isDSHRemoteError: true,
							code: "gateway/internal",
							details: {}
						}));
					});
				};
				const restart = (tabId, file, signal, observedVersion, mode = "text-pages") => {
					if (signal.aborted) return;
					const reads = readsOf(tabId, signal);
					reads.controller?.abort();
					reads.generation += 1;
					reads.version = void 0;
					actions.reset(tabId);
					if (mode === "text-pages") loadPage(tabId, file, 1, signal, observedVersion);
					else loadAll(tabId, file, signal, observedVersion);
				};
				return {
					loadPage,
					reloadPages: restart,
					loadAll,
					prepareRenderer: (tabId, signal, rendererId, observedVersion, reload = false) => {
						if (signal.aborted) return;
						modeOf(tabId, signal, "renderer", rendererId);
						if (reload) actions.reset(tabId);
						actions.loading(tabId, "renderer", observedVersion, rendererId);
					},
					reloadAll: (tabId, file, signal, observedVersion) => {
						restart(tabId, file, signal, observedVersion, "bytes-complete");
					}
				};
			};
		}
		//#endregion
		//#region lib/types/client/store.js
		/**
		* A tab's state before it reads, scrolls, toggles, or answers anything.
		* @returns the empty bucket.
		*/
		function fresh() {
			return {
				loadRevision: 0,
				version: void 0,
				observedVersion: void 0,
				pages: {},
				eof: false,
				loading: false,
				failure: void 0,
				scrollTop: 0,
				wrap: true,
				revision: void 0
			};
		}
		/** The bucket for one tab, created on first write. */
		function bucket(state, tabId) {
			return state.byTab[tabId] ??= fresh();
		}
		/**
		* Declare the preview's store.
		*
		* Constructed once in apply and shared by the body and the tools registrations,
		* which the slot runtime allows because both are session-scoped.
		* @returns the store handle to declare on both registrations.
		*/
		function createTextStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({ byTab: {} }),
				actions: {
					/** @param d - draft. @param tabId - owning tab. @param rendererId - manual choice, or automatic selection. */
					selected: (d, tabId, rendererId) => {
						if (rendererId === void 0) delete bucket(d, tabId).rendererId;
						else bucket(d, tabId).rendererId = rendererId;
					},
					/**
					* Mark a page read as in flight.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param mode - selected renderer's loading mode.
					* @param observedVersion - metadata version at read start; later pages retain the initial observation.
					* @param contentRendererId - implementation owning source loading.
					*/
					loading: (d, tabId, mode, observedVersion, contentRendererId) => {
						const state = bucket(d, tabId);
						if (state.version === void 0 && !state.loading) state.observedVersion = observedVersion;
						if (contentRendererId === void 0) delete state.contentRendererId;
						else state.contentRendererId = contentRendererId;
						state.loading = true;
						state.failure = void 0;
						if (mode !== void 0) state.mode = mode;
					},
					/**
					* @param d - draft. @param tabId - owning tab.
					* @param revision - active content revision. @param version - displayed source version.
					*/
					rendered: (d, tabId, revision, version) => {
						const state = d.byTab[tabId];
						if (state?.mode !== "renderer" || state.loadRevision !== revision) return;
						state.version = version;
						state.loading = false;
					},
					/** @param d - draft. @param tabId - owning tab. @param file - complete byte result for this view. */
					complete: (d, tabId, file) => {
						const state = bucket(d, tabId);
						state.complete = file;
						state.version = file.version;
						state.eof = true;
						state.loading = false;
						state.failure = void 0;
					},
					/**
					* Keep one page. A page from a newer file version invalidates the pages
					* of the older one, so the body never shows two versions at once.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param page - the page the Host returned.
					*/
					page: (d, tabId, page) => {
						const state = bucket(d, tabId);
						if (state.version !== void 0 && state.version !== page.version) state.pages = {};
						state.version = page.version;
						state.pages[page.offset] = {
							text: page.text,
							lines: page.lines
						};
						state.eof = page.eof;
						state.loading = false;
						state.failure = void 0;
					},
					/**
					* Record why a page read failed; the pages already held stay.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param failure - the settled Remote failure.
					*/
					failed: (d, tabId, failure) => {
						const state = bucket(d, tabId);
						state.loading = false;
						state.failure = failure;
					},
					/**
					* Drop every page, keeping the view, for a re-read from the first line.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					*/
					reset: (d, tabId) => {
						const state = bucket(d, tabId);
						state.loadRevision++;
						state.pages = {};
						delete state.complete;
						state.eof = false;
						state.version = void 0;
						state.observedVersion = void 0;
						state.loading = false;
						state.failure = void 0;
					},
					/**
					* Record where one tab's body is scrolled to.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param scrollTop - the body's scroll offset, in px.
					*/
					scrolled: (d, tabId, scrollTop) => {
						bucket(d, tabId).scrollTop = scrollTop;
					},
					/**
					* Switch one tab between wrapped and unwrapped lines.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					*/
					toggledWrap: (d, tabId) => {
						const state = bucket(d, tabId);
						state.wrap = !state.wrap;
					},
					/**
					* Record that the body answered one navigation, so a remount restores the
					* reader's position instead of jumping again.
					* @param d - draft state.
					* @param tabId - the tab being drawn.
					* @param revision - the `navigation.revision` answered.
					*/
					navigated: (d, tabId, revision) => {
						bucket(d, tabId).revision = revision;
					},
					/**
					* Drop one tab's state, for a tab record that is gone.
					* @param d - draft state.
					* @param tabId - the tab that went away.
					*/
					forget: (d, tabId) => {
						const byTab = {};
						for (const [id, state] of Object.entries(d.byTab)) if (id !== tabId) byTab[id] = state;
						d.byTab = byTab;
					}
				}
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* `sidebarDocumentPreview` namespace dictionaries.
		*
		* The failure lines are the point of this file: a preview that cannot show a
		* page has to say which of several different things went wrong, and each one
		* suggests a different next step for the reader.
		*/
		/** Simplified Chinese dictionary and key-set source of truth. */
		const zh$6 = {
			loading: "正在读取…",
			loadMore: "加载更多",
			changed: "文件已更新，当前显示为旧内容",
			reloadNow: "重新载入",
			reload: "重新读取文件",
			"wrap.enable": "自动换行",
			"wrap.disable": "取消换行",
			"wrap.aria": "自动换行",
			openWith: "打开方式",
			"viewer.text": "纯文本",
			resourceUnavailable: "文件资源服务不可用",
			rendererUnavailable: "预览器 {name} 不可用",
			unsupportedFile: "该格式文件暂时无法预览",
			"error.notFound": "文件不存在，可能已被移动或删除",
			"error.tooLarge": "单页内容超过 {limit} 上限，无法读取",
			"error.notText": "该格式文件暂时无法预览",
			"error.notRegularFile": "该路径不是普通文件，没有可显示的内容",
			"error.unavailable": "读取失败：{message}",
			retry: "重试"
		};
		/** English dictionary, checked against the Chinese key set. */
		const en$6 = {
			loading: "Reading…",
			loadMore: "Load more",
			changed: "The file has changed, showing the previous content.",
			reloadNow: "Reload",
			reload: "Read the file again",
			"wrap.enable": "Turn on line wrap",
			"wrap.disable": "Turn off line wrap",
			"wrap.aria": "Line wrap",
			openWith: "Open with",
			"viewer.text": "Plain text",
			resourceUnavailable: "The file resource service is unavailable.",
			rendererUnavailable: "The {name} preview is unavailable.",
			unsupportedFile: "Preview is not available for this file type yet.",
			"error.notFound": "File not found. It may have been moved or deleted.",
			"error.tooLarge": "This page exceeds the {limit} limit and cannot be read.",
			"error.notText": "Preview is not available for this file type yet.",
			"error.notRegularFile": "Not a regular file, nothing to display.",
			"error.unavailable": "Read failed: {message}",
			retry: "Retry"
		};
		//#endregion
		//#region lib/types/client/document/contract.js
		/**
		* Forward the framework's tab reader to the selected document body.
		* @param _standard - framework standard props.
		* @param useTabInfo - enclosing tab's bound reader.
		* @returns the same reader, without another subscription adapter.
		*/
		const documentTabInfoFactory = (_standard, useTabInfo) => useTabInfo;
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/markdown/MarkdownBody.module.css.mjs
		const css$5 = "._0RKuNG_document{min-width:0;font-family:var(--dsw-font,inherit);white-space:normal;padding:10px 12px}";
		const tagId$5 = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/MarkdownBody.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId$5;
			tag.textContent = css$5;
			document.head.appendChild(tag);
		}
		var MarkdownBody_module_css_default = { "document": "_0RKuNG_document" };
		//#endregion
		//#region lib/types/client/markdown/MarkdownBody.js
		/** One retained Markdown renderer over the document owner's accumulated text. */
		/**
		* Render one accumulated document; EOF completes the primitive's full parse.
		* @param props - owner-loaded contents and localized primitive labels.
		* @returns Markdown content, or nothing for a non-text delivery.
		*/
		function MarkdownBody({ content, t }) {
			const copyLabel = t("code.copy");
			const copiedLabel = t("code.copied");
			const footnotes = t("footnotes");
			const labels = (0, react.useMemo)(() => ({
				code: {
					copyLabel,
					copiedLabel
				},
				footnotes
			}), [
				copyLabel,
				copiedLabel,
				footnotes
			]);
			if (content.kind !== "text") return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: MarkdownBody_module_css_default.document,
				"data-document-markdown": true,
				children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
					text: content.text,
					streaming: !content.eof,
					labels
				})
			});
		}
		//#endregion
		//#region lib/types/client/markdown/locales.js
		/** Markdown implementation labels and primitive chrome. */
		const zh$5 = {
			"viewer.label": "Markdown",
			"code.copy": "复制",
			"code.copied": "已复制",
			"footnotes": "脚注"
		};
		/** English labels, paired with the Chinese key set. */
		const en$5 = {
			"viewer.label": "Markdown",
			"code.copy": "Copy",
			"code.copied": "Copied",
			"footnotes": "Footnotes"
		};
		//#endregion
		//#region lib/types/client/markdown/index.js
		/** Implementation identity shared by metadata and the document slot. */
		const MARKDOWN_BODY_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown";
		/**
		* Describe the Markdown implementation without taking ownership of loading.
		* @param title - locale-owned implementation name.
		* @returns builtin Markdown registration metadata.
		*/
		function markdownDefinition(title) {
			return {
				id: MARKDOWN_BODY_ID,
				extensions: ["md", "markdown"],
				priority: "builtin",
				title,
				loading: "text-pages",
				wrap: false
			};
		}
		/**
		* Register locale, metadata, and the document body for the owning plugin lifetime.
		* @param ctx - plugin context carrying locale, document registry, and slots.
		*/
		function apply$6(ctx) {
			const t = ctx.locale.bind("documentMarkdown");
			ctx.effect(() => ctx.locale.register("documentMarkdown", {
				zh: zh$5,
				en: en$5
			}), "document-markdown: dictionaries");
			ctx.effect(() => ctx.documentPreviews.register(markdownDefinition(() => t("viewer.label"))), "document-markdown: metadata");
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: MARKDOWN_BODY_ID,
				locale: "documentMarkdown"
			}, MarkdownBody)), "document-markdown: body");
		}
		//#endregion
		//#region lib/types/client/html/bytes.js
		/** UTF-8 decoding for file bytes and encoding only for the iframe's script payload. */
		const BASE64_CHUNK_BYTES = 32768;
		/**
		* Decode complete UTF-8 text, rejecting invalid byte sequences.
		* @param data - complete UTF-8 bytes.
		* @returns decoded text; invalid UTF-8 throws.
		*/
		function decodeText(data) {
			return new TextDecoder("utf-8", { fatal: true }).decode(data);
		}
		/**
		* Encode Unicode text for the iframe's base64 payload.
		* @param text - Unicode text.
		* @returns base64 of its UTF-8 bytes.
		*/
		function encodeText(text) {
			const bytes = new TextEncoder().encode(text);
			const chunks = [];
			for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES)));
			return btoa(chunks.join(""));
		}
		//#endregion
		//#region lib/types/client/html/bootstrap.js
		/** A fixed bootstrap runs inside the opaque iframe; no Host callbacks enter its document. */
		/**
		* Build the outer iframe document. Its resource URLs are created inside the sandbox,
		* because that opaque origin cannot load resource URLs created by the parent.
		* @param bundle - complete HTML bytes and optional static dependencies.
		* @returns bootstrap HTML; invalid UTF-8 throws before navigation.
		*/
		function createHtmlDocument(bundle) {
			return `<!doctype html><meta charset="utf-8"><script>(()=>{
const bytes=data=>Uint8Array.from(atob(data),character=>character.charCodeAt(0));
const text=data=>new TextDecoder('utf-8',{fatal:true}).decode(bytes(data));
const bundle=JSON.parse(text("${encodeText(JSON.stringify({
				html: decodeText(bundle.data),
				assets: bundle.assets.map((asset) => ({
					kind: asset.kind,
					reference: asset.reference,
					text: decodeText(asset.data)
				}))
			}))}"));
let html=bundle.html;
if(bundle.assets.length){
  const parsed=new DOMParser().parseFromString(html,'text/html');
  for(const asset of bundle.assets){
    const script=asset.kind==='script';
    const url=URL.createObjectURL(new Blob([asset.text],{type:script?'application/javascript':'text/css'}));
    const attribute=script?'src':'href';
    for(const element of parsed.querySelectorAll(script?'script[src]':'link[rel~="stylesheet" i][href]')){
      if(element.getAttribute(attribute)===asset.reference)element.setAttribute(attribute,url);
    }
  }
  html='<!doctype html>'+parsed.documentElement.outerHTML;
}
document.open();document.write(html);document.close();
})()<\/script>`;
		}
		//#endregion
		//#region lib/types/client/html/pack.js
		const MAX_ASSET_BYTES = 4 * 1024 * 1024;
		const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
		const MAX_ASSETS = 64;
		/** Whether this reference can be read relative to the original document, never the parent application URL. */
		function relative(reference) {
			return reference.length > 0 && !/^(?:[a-z][a-z\d+.-]*:|[/\\#?])/iu.test(reference) && !reference.includes("\0");
		}
		/**
		* Collect static dependencies without executing or mounting document elements in the parent page.
		* A base element leaves URL resolution to the browser. Only direct .js classic scripts and .css
		* links are packed; local CSS url/import, modules and dynamically constructed URLs are unsupported.
		* @param data - complete UTF-8 HTML bytes.
		* @param readRelative - original-document-scoped read, never exposed to the iframe.
		* @param signal - stops reads and prevents publication after cancellation.
		* @returns complete HTML and its finite static asset set; decoding, limits and read failures reject.
		*/
		async function packHtml(data, readRelative, signal) {
			signal.throwIfAborted();
			let total = data.byteLength;
			if (total > MAX_TOTAL_BYTES) throw new Error("HTML package exceeds its total byte limit");
			const template = document.createElement("template");
			template.innerHTML = decodeText(data);
			const assets = [];
			if (template.content.querySelector("base[href]") !== null) return {
				data,
				assets
			};
			const seen = /* @__PURE__ */ new Set();
			for (const element of template.content.querySelectorAll("script[src],link[href]")) {
				const script = element.localName === "script";
				const type = element.getAttribute("type")?.trim().toLowerCase() ?? "";
				if (script && ![
					"",
					"text/javascript",
					"application/javascript"
				].includes(type)) continue;
				if (!script && !(element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/u).includes("stylesheet")) continue;
				const reference = element.getAttribute(script ? "src" : "href");
				const suffix = reference.search(/[?#]/u);
				const path = suffix === -1 ? reference : reference.slice(0, suffix);
				if (!relative(reference) || !(script ? /\.js$/iu : /\.css$/iu).test(path)) continue;
				const kind = script ? "script" : "stylesheet";
				const key = `${kind}:${reference}`;
				if (seen.has(key)) continue;
				if (assets.length >= MAX_ASSETS) throw new Error("HTML package exceeds its asset count limit");
				signal.throwIfAborted();
				const asset = await readRelative(reference, signal);
				signal.throwIfAborted();
				const size = asset.data.byteLength;
				if (size > MAX_ASSET_BYTES) throw new Error("HTML asset exceeds its byte limit");
				total += size;
				if (total > MAX_TOTAL_BYTES) throw new Error("HTML package exceeds its total byte limit");
				decodeText(asset.data);
				assets.push({
					kind,
					reference,
					data: asset.data
				});
				seen.add(key);
			}
			return {
				data,
				assets
			};
		}
		//#endregion
		//#region lib/types/client/html/read-relative.js
		/**
		* Bind a package reader to the original HTML file's address.
		* @param readRelated - Remote reader using the Session in the root HTML address.
		* @param address - root HTML file address.
		* @param lifetime - tab lifetime.
		* @returns a reader that strips URL query/fragment, decodes one path, and preserves Host failures.
		*/
		function createReadHtmlRelative(readRelated, address, lifetime) {
			return async (reference, signal) => {
				const suffix = reference.search(/[?#]/u);
				const path = decodeURIComponent(suffix === -1 ? reference : reference.slice(0, suffix));
				if (path.length === 0 || /^(?:[a-z][a-z\d+.-]*:|[/\\])/iu.test(path) || path.includes("\0") || path.includes("\\")) throw new Error("HTML dependency must use a relative file path");
				const combined = AbortSignal.any([lifetime, signal]);
				combined.throwIfAborted();
				const result = await readRelated(address, path, combined);
				combined.throwIfAborted();
				if (!result.ok) throw new Error(result.error.message);
				return documentFileBytes(result.value);
			};
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/html/HtmlBody.module.css.mjs
		const css$4 = ".HyIruq_frame{background:var(--dsw-alias-bg-base);border:none;width:100%;height:100%;min-height:240px;display:block}.HyIruq_status{color:var(--dsw-alias-label-secondary);white-space:normal;margin:0;padding:10px}.HyIruq_opening{box-sizing:border-box;justify-content:center;width:100%;min-height:100%}";
		const tagId$4 = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/HtmlBody.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var HtmlBody_module_css_default = {
			"frame": "HyIruq_frame",
			"opening": "HyIruq_opening",
			"status": "HyIruq_status"
		};
		//#endregion
		//#region lib/types/client/html/HtmlBody.js
		/** Complete HTML rendered in a script-enabled opaque iframe, without parent application access. */
		/** One mounted file owns its root Blob; replacing content also replaces the browsing context. */
		function HtmlFrame({ data, readRelative, t }) {
			const [frame, setFrame] = (0, react.useState)();
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				let url;
				(async () => {
					try {
						const bundle = await packHtml(data, readRelative, controller.signal);
						controller.signal.throwIfAborted();
						const html = createHtmlDocument(bundle);
						url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
						setFrame({
							data,
							readRelative,
							url
						});
					} catch {
						if (!controller.signal.aborted) setFrame({
							data,
							readRelative,
							url: void 0
						});
					}
				})();
				return () => {
					controller.abort();
					if (url !== void 0) URL.revokeObjectURL(url);
				};
			}, [data, readRelative]);
			if (frame?.data !== data || frame.readRelative !== readRelative) return (0, react_jsx_runtime.jsx)(LoadingIndicator, {
				className: clsx(HtmlBody_module_css_default.status, HtmlBody_module_css_default.opening),
				label: t("loading")
			});
			if (frame.url === void 0) return (0, react_jsx_runtime.jsx)("p", {
				className: HtmlBody_module_css_default.status,
				role: "alert",
				children: t("failed")
			});
			return (0, react_jsx_runtime.jsx)("iframe", {
				className: HtmlBody_module_css_default.frame,
				src: frame.url,
				sandbox: "allow-scripts",
				title: t("frame"),
				"data-html-preview": true
			}, frame.url);
		}
		/**
		* Render complete HTML with the standard file and tab hooks.
		* @param props - document bytes, hooks, related-file reader and locale.
		* @returns an isolated HTML document, or nothing for text delivery.
		*/
		function HtmlBody({ content, resourceAddress, readRelated, useTabInfo, t }) {
			const { tab } = useTabInfo();
			const readRelative = (0, react.useMemo)(() => createReadHtmlRelative(readRelated, resourceAddress, tab.signal), [
				readRelated,
				resourceAddress,
				tab.signal
			]);
			if (content.kind !== "bytes") return null;
			return (0, react_jsx_runtime.jsx)(HtmlFrame, {
				data: content.data,
				readRelative,
				t
			}, resourceAddress);
		}
		//#endregion
		//#region lib/types/client/html/locales.js
		/** Locale-owned HTML implementation name and iframe status text. */
		const zh$4 = {
			title: "HTML",
			frame: "HTML 文档预览",
			loading: "正在读取…",
			failed: "无法预览这份 HTML 文档"
		};
		/** English dictionary with the same keys as the Chinese dictionary. */
		const en$4 = {
			title: "HTML",
			frame: "HTML document preview",
			loading: "Reading…",
			failed: "This HTML document could not be previewed."
		};
		//#endregion
		//#region lib/types/client/html/index.js
		/** HTML implementation identity, shared by metadata and the keyed slot. */
		const HTML_BODY_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/html";
		/**
		* Describe the builtin HTML renderer's file types and loading mode.
		* @param title - locale-owned implementation name.
		* @returns metadata for complete HTML documents.
		*/
		function htmlBodyDefinition(title) {
			return {
				id: HTML_BODY_ID,
				extensions: ["html", "htm"],
				priority: "builtin",
				title,
				loading: "bytes-complete",
				wrap: false
			};
		}
		/**
		* Register the HTML dictionary, metadata and body with reversible effects.
		* @param ctx - owning plugin context.
		*/
		function apply$5(ctx) {
			const t = ctx.locale.bind("documentHtml");
			ctx.effect(() => ctx.locale.register("documentHtml", {
				zh: zh$4,
				en: en$4
			}));
			ctx.effect(() => ctx.documentPreviews.register(htmlBodyDefinition(() => t("title"))));
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: HTML_BODY_ID,
				locale: "documentHtml",
				inject: () => ({ readRelated: (address, relativePath, signal) => {
					const file = hostFileOf(address);
					return ctx.remote.workspaceFiles.readRelated(file.sessionId, file.path, relativePath, signal);
				} })
			}, HtmlBody)));
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/image/ImageBody.module.css.mjs
		const css$3 = ".JFRUHG_frame{box-sizing:border-box;width:100%;height:max-content;min-height:100%;font-family:var(--dsw-font,sans-serif);white-space:normal;padding:12px;display:flex}.JFRUHG_image{user-select:none;border-radius:8px;flex:none;width:auto;max-width:100%;height:auto;max-height:none;margin:auto;display:block}.JFRUHG_image[hidden]{display:none}.JFRUHG_status{box-sizing:border-box;width:100%;min-height:100%;color:var(--dsw-alias-label-secondary);white-space:normal;justify-content:center;align-items:center;margin:0;padding:10px;font-size:13px;line-height:1.5;display:flex}";
		const tagId$3 = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/ImageBody.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var ImageBody_module_css_default = {
			"frame": "JFRUHG_frame",
			"image": "JFRUHG_image",
			"status": "JFRUHG_status"
		};
		//#endregion
		//#region lib/types/client/image/ImageBody.js
		/** Complete image bytes rendered rounded within an inset frame, scaled down to the pane's width. */
		const IMAGE_MEDIA_TYPES = {
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			gif: "image/gif",
			webp: "image/webp",
			bmp: "image/bmp",
			ico: "image/x-icon",
			svg: "image/svg+xml"
		};
		/**
		* Resolve a supported filename to the media type assigned to its Blob.
		* @param path - decoded workspace file path.
		* @returns the image media type, or undefined for an unregistered suffix.
		*/
		function imageMediaType(path) {
			const normalized = path.replaceAll("\\", "/");
			const name = normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
			return IMAGE_MEDIA_TYPES[name.slice(name.lastIndexOf(".") + 1)];
		}
		/**
		* Present complete image bytes fitted to the pane's width.
		* @param props - document bytes, resource identity, and locale.
		* @returns a rounded image scaled down to the pane's width at its aspect
		* ratio — a smaller image centres at its intrinsic size — whose containing
		* document body provides vertical scrolling.
		*/
		function ImageBody({ content, resourceAddress, t }) {
			const path = (0, react.useMemo)(() => hostFileOf(resourceAddress).path, [resourceAddress]);
			const mediaType = imageMediaType(path);
			const data = content.kind === "bytes" ? content.data : void 0;
			const [source, setSource] = (0, react.useState)();
			(0, react.useEffect)(() => {
				if (data === void 0 || mediaType === void 0) return;
				let url;
				try {
					url = URL.createObjectURL(new Blob([data], { type: mediaType }));
					setSource({
						kind: "ready",
						data,
						mediaType,
						url
					});
				} catch {
					setSource({
						kind: "failed",
						data,
						mediaType
					});
				}
				return () => {
					if (url !== void 0) URL.revokeObjectURL(url);
				};
			}, [data, mediaType]);
			if (data === void 0 || mediaType === void 0) return (0, react_jsx_runtime.jsx)("p", {
				className: ImageBody_module_css_default.status,
				role: "alert",
				children: t("unsupported")
			});
			if (source?.data !== data || source.mediaType !== mediaType) return (0, react_jsx_runtime.jsx)(LoadingIndicator, {
				className: ImageBody_module_css_default.status,
				label: t("loading")
			});
			if (source.kind === "failed") return (0, react_jsx_runtime.jsx)("p", {
				className: ImageBody_module_css_default.status,
				role: "alert",
				children: t("failed")
			});
			const { name } = pathPartsOf(path);
			return (0, react_jsx_runtime.jsx)(LoadedImage, {
				url: source.url,
				name,
				t
			}, source.url);
		}
		/** SVG stays in the browser's static image mode because its bytes only reach an img Blob URL. */
		function LoadedImage({ url, name, t }) {
			const [state, setState] = (0, react.useState)("loading");
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ImageBody_module_css_default.frame,
				"data-image-preview": true,
				children: [
					state === "loading" && (0, react_jsx_runtime.jsx)(LoadingIndicator, {
						className: ImageBody_module_css_default.status,
						label: t("loading")
					}),
					state === "failed" && (0, react_jsx_runtime.jsx)("p", {
						className: ImageBody_module_css_default.status,
						role: "alert",
						children: t("failed")
					}),
					(0, react_jsx_runtime.jsx)("img", {
						className: ImageBody_module_css_default.image,
						src: url,
						alt: t("preview", { name }),
						decoding: "async",
						draggable: false,
						referrerPolicy: "no-referrer",
						hidden: state !== "ready",
						onLoad: () => {
							setState("ready");
						},
						onError: () => {
							setState("failed");
						}
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/image/locales.js
		/** Locale-owned image renderer labels and status text. */
		const zh$3 = {
			title: "图片",
			preview: "图片预览：{name}",
			loading: "正在读取…",
			failed: "无法显示这张图片",
			unsupported: "图片预览需要完整文件内容"
		};
		/** English dictionary with the same keys as the Chinese dictionary. */
		const en$3 = {
			title: "Image",
			preview: "Image preview: {name}",
			loading: "Reading…",
			failed: "This image could not be displayed.",
			unsupported: "Image preview requires the complete file contents."
		};
		//#endregion
		//#region lib/types/client/image/index.js
		/** Image implementation identity, shared by metadata and the keyed slot. */
		const IMAGE_BODY_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/image";
		/** File suffixes rendered by the builtin image body. */
		const IMAGE_EXTENSIONS = [
			"png",
			"jpg",
			"jpeg",
			"gif",
			"webp",
			"bmp",
			"ico",
			"svg"
		];
		/** Bitmap suffixes whose bytes are unreadable as text; SVG stays out because its XML source is worth reading. */
		const BINARY_IMAGE_EXTENSIONS = [
			"png",
			"jpg",
			"jpeg",
			"gif",
			"webp",
			"bmp",
			"ico"
		];
		/**
		* Describe the builtin image renderer independently from its keyed body slot.
		* @param title - locale-owned implementation name.
		* @returns metadata for complete image files.
		*/
		function imageBodyDefinition(title) {
			return {
				id: IMAGE_BODY_ID,
				extensions: IMAGE_EXTENSIONS,
				binaryExtensions: BINARY_IMAGE_EXTENSIONS,
				priority: "builtin",
				title,
				loading: "bytes-complete",
				wrap: false
			};
		}
		/**
		* Register the image dictionary, metadata, and body with reversible effects.
		* @param ctx - owning plugin context.
		*/
		function apply$4(ctx) {
			const t = ctx.locale.bind("sidebarImage");
			ctx.effect(() => ctx.locale.register("sidebarImage", {
				zh: zh$3,
				en: en$3
			}), "document-image: dictionaries");
			ctx.effect(() => ctx.documentPreviews.register(imageBodyDefinition(() => t("title"))), "document-image: metadata");
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: IMAGE_BODY_ID,
				locale: "sidebarImage"
			}, ImageBody)), "document-image: body");
		}
		//#endregion
		//#region lib/types/client/document/tab-lifetime.js
		/**
		* Release retained view state on tab closure or plugin disposal.
		* @param ctx - owning preview plugin context.
		* @returns a callback accepting the tab, its lifetime signal, and its store's forget action; repeated holds share one listener.
		*/
		function retainDocumentTabs(ctx) {
			const retained = /* @__PURE__ */ new Map();
			ctx.effect(() => () => {
				for (const forget of retained.values()) forget();
			});
			return (tabId, signal, forgetTab) => {
				if (signal.aborted) {
					forgetTab(tabId);
					return;
				}
				if (retained.has(signal)) return;
				const forget = () => {
					signal.removeEventListener("abort", forget);
					retained.delete(signal);
					forgetTab(tabId);
				};
				retained.set(signal, forget);
				signal.addEventListener("abort", forget, { once: true });
			};
		}
		//#endregion
		//#region lib/types/client/pdf/LazyPdfBody.js
		/** Load the PDF renderer only after a PDF body is mounted. */
		const LoadedPdfBody = (0, react.lazy)(async () => ({ default: (await require.async("./client.pdf.js")).PdfBody }));
		/**
		* Suspend while the package-local PDF chunk arrives.
		* @param props - PDF body props supplied by the document slot.
		* @returns the deferred PDF renderer.
		*/
		function LazyPdfBody(props) {
			return (0, react_jsx_runtime.jsx)(react.Suspense, {
				fallback: (0, react_jsx_runtime.jsx)(LoadingIndicator, {
					className: TextPreview_module_css_default.status,
					label: props.t("loading")
				}),
				children: (0, react_jsx_runtime.jsx)(LoadedPdfBody, { ...props })
			});
		}
		//#endregion
		//#region lib/types/client/pdf/store.js
		/** Restorable PDF viewing preferences; document objects and canvases remain component-local. */
		/**
		* Declare the last visible page isolated by tab identity.
		* @returns a store declaration instantiated by the document slot for each Session.
		*/
		function createPdfStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({ byTab: {} }),
				actions: {
					/** @param draft - view state. @param tabId - owning tab. @param page - selected 1-based page. */
					page: (draft, tabId, page) => {
						draft.byTab[tabId] = { page };
					},
					/** @param draft - view state. @param tabId - closed tab whose preferences are discarded. */
					forget: (draft, tabId) => {
						const remaining = {};
						for (const [id, view] of Object.entries(draft.byTab)) if (id !== tabId) remaining[id] = view;
						draft.byTab = remaining;
					}
				}
			});
		}
		//#endregion
		//#region lib/types/client/pdf/locales.js
		/** Copy owned by the PDF renderer. */
		const zh$2 = {
			title: "PDF",
			pageImage: "PDF 第 {page} 页",
			loading: "正在读取…",
			rendering: "正在绘制页面…",
			failed: "无法显示 PDF：{message}",
			password: "此 PDF 需要密码，暂不支持预览",
			workerFailed: "PDF 渲染进程无法继续，请重试",
			unsupported: "PDF 预览需要完整文件内容",
			retry: "重试"
		};
		/** English PDF-renderer dictionary. */
		const en$2 = {
			title: "PDF",
			pageImage: "PDF page {page}",
			loading: "Reading…",
			rendering: "Rendering page…",
			failed: "Cannot display PDF: {message}",
			password: "This PDF requires a password; password-protected previews are not supported.",
			workerFailed: "The PDF rendering process could not continue. Please retry.",
			unsupported: "PDF preview requires the complete file contents.",
			retry: "Retry"
		};
		//#endregion
		//#region lib/types/client/pdf/index.js
		/** PDF metadata and keyed body share this package-local implementation identity. */
		const PDF_BODY_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/pdf";
		/**
		* Describe the builtin PDF renderer independently from its keyed body slot.
		* @param title - locale-owned implementation name.
		* @returns the complete-file PDF registration.
		*/
		function pdfBodyDefinition(title) {
			return {
				id: PDF_BODY_ID,
				extensions: ["pdf"],
				binaryExtensions: ["pdf"],
				priority: "builtin",
				title,
				loading: "bytes-complete",
				wrap: false
			};
		}
		/** @param ctx - context carrying the locale, document registry, and slot registry. */
		function apply$3(ctx) {
			ctx.effect(() => ctx.locale.register("sidebarPdf", {
				zh: zh$2,
				en: en$2
			}));
			const t = ctx.locale.bind("sidebarPdf");
			ctx.effect(() => ctx.documentPreviews.register(pdfBodyDefinition(() => t("title"))));
			const presentation = pdfBodyRegistration(ctx);
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: PDF_BODY_ID,
				locale: "sidebarPdf",
				...presentation
			}, LazyPdfBody)));
		}
		/**
		* Retain PDF viewing state for a document entry's tab lifetime.
		* @param ctx - owning registration context.
		* @returns the store and injection shared by ordinary and Office PDF registrations.
		*/
		function pdfBodyRegistration(ctx) {
			const store = createPdfStore();
			const retainTab = retainDocumentTabs(ctx);
			return {
				store,
				inject: (_sessionId, actions) => ({ retainTab: (tabId, signal) => {
					retainTab(tabId, signal, actions.forget);
				} })
			};
		}
		//#endregion
		//#region lib/types/client/code/languages.js
		const languages = new Map(Object.entries({
			typescript: [
				"ts",
				"tsx",
				"mts",
				"cts"
			],
			javascript: [
				"js",
				"jsx",
				"mjs",
				"cjs"
			],
			shellscript: [
				"sh",
				"bash",
				"zsh"
			],
			json: [
				"json",
				"jsonc",
				"jsonl",
				"ndjson"
			],
			python: [
				"py",
				"pyw",
				"pyi"
			],
			ruby: [
				"rb",
				"rake",
				"gemspec"
			],
			go: ["go"],
			rust: ["rs"],
			java: ["java"],
			c: ["c", "h"],
			cpp: [
				"cc",
				"cpp",
				"cxx",
				"hh",
				"hpp",
				"hxx"
			],
			csharp: ["cs"],
			kotlin: ["kt", "kts"],
			swift: ["swift"],
			php: ["php"],
			yaml: ["yaml", "yml"],
			toml: ["toml"],
			ini: ["ini"],
			markdown: ["md", "markdown"],
			mdx: ["mdx"],
			html: [
				"html",
				"htm",
				"xhtml"
			],
			css: ["css"],
			scss: ["scss"],
			less: ["less"],
			sql: ["sql"],
			xml: [
				"xml",
				"xsd",
				"xsl",
				"xslt"
			],
			lua: ["lua"]
		}).flatMap(([language, extensions]) => extensions.map((extension) => [extension, language])));
		/** Recognized suffixes shared by renderer selection and language hints. */
		const CODE_EXTENSIONS = [...languages.keys()];
		/**
		* Select the shared highlighter's grammar for a filename.
		* @param path - decoded source filename or path.
		* @returns a supported grammar hint, or undefined for other suffixes.
		*/
		function languageForPath(path) {
			const extension = /\.([^./]+)$/u.exec(path.replaceAll("\\", "/"))?.[1]?.toLowerCase();
			return extension === void 0 ? void 0 : languages.get(extension);
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/code/CodeBody.module.css.mjs
		const css$2 = ".Java6a_renderer{white-space:normal;flex-direction:column;flex:auto;width:100%;min-width:0;height:100%;min-height:0;display:flex;overflow:hidden}.Java6a_renderer .Java6a_code{--dsl-code-block-border-radius:0px;--dsl-code-block-line-white-space:pre;--dsl-code-block-background:transparent;flex-direction:column;flex:auto;min-width:0;height:100%;min-height:0;margin:0;display:flex;position:static}.Java6a_renderer .Java6a_code>[data-code-block-content]{flex:auto;min-width:0;min-height:0;display:block;position:relative;overflow:auto}.Java6a_renderer .Java6a_code>[data-code-block-content]::-webkit-scrollbar-track{margin:2px}.Java6a_renderer .Java6a_code pre{box-sizing:border-box;white-space:pre;word-break:normal;overflow-wrap:normal;min-width:100%;overflow:visible}.Java6a_renderer[data-wrap=true] .Java6a_code{--dsl-code-block-line-white-space:pre-wrap}.Java6a_renderer[data-wrap=true] .Java6a_code pre{white-space:pre-wrap;overflow-wrap:anywhere}";
		const tagId$2 = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/CodeBody.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var CodeBody_module_css_default = {
			"code": "Java6a_code",
			"renderer": "Java6a_renderer"
		};
		//#endregion
		//#region lib/types/client/code/CodeBody.js
		/** @param props - accumulated document contents and framework props. @returns one stable CodeBlock, or no body for byte contents. */
		function CodeBody({ resourceAddress, content, wrap, scrollportRef, t }) {
			if (content.kind !== "text") return null;
			const file = parseFileAddress(resourceAddress);
			if (file === void 0) throw new Error(`ui-sidebar-documentpreview: not a file address "${resourceAddress}"`);
			const language = languageForPath(file.path);
			return (0, react_jsx_runtime.jsx)("div", {
				className: CodeBody_module_css_default.renderer,
				"data-code-preview": true,
				"data-wrap": wrap,
				children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.CodeBlock, {
					className: CodeBody_module_css_default.code,
					contentRef: scrollportRef,
					code: content.text,
					lang: language,
					streaming: !content.eof,
					lineNumbers: true,
					copyLabel: t("copy"),
					copiedLabel: t("copied")
				})
			});
		}
		//#endregion
		//#region lib/types/client/code/locales.js
		/** Simplified Chinese dictionary and key source. */
		const zh$1 = {
			title: "代码",
			copy: "复制",
			copied: "已复制"
		};
		/** English dictionary with the same keys. */
		const en$1 = {
			title: "Code",
			copy: "Copy",
			copied: "Copied"
		};
		//#endregion
		//#region lib/types/client/code/index.js
		const ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/code";
		const NS$1 = "sidebarCodePreview";
		/** @param ctx - owning plugin context. Register localized metadata and the matching keyed document body. */
		function apply$2(ctx) {
			ctx.effect(() => ctx.locale.register(NS$1, {
				zh: zh$1,
				en: en$1
			}));
			const t = ctx.locale.bind(NS$1);
			ctx.effect(() => ctx.documentPreviews.register({
				id: ID,
				extensions: CODE_EXTENSIONS,
				priority: "builtin",
				title: () => t("title"),
				loading: "text-pages",
				wrap: true
			}));
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: ID,
				locale: NS$1
			}, CodeBody)));
		}
		//#endregion
		//#region lib/types/client/office/locales.js
		/** Office preview copy and Host render configuration guidance. */
		const zh = {
			title: "Office 文档",
			loading: "正在读取…",
			retry: "重试",
			missingFonts: "缺少文档使用的字体：{fonts}，可能影响文字和排版。",
			fontDiagnosticsUnavailable: "本次预览未检查字体完整性，文字和排版可能与原文档不同。",
			showMore: "显示更多",
			dismissNotice: "关闭字体提示",
			missingFontsTitle: "缺失的字体",
			missingFontsDescription: "本次预览无法使用以下字体，预览中的文字和排版可能与原文档不同。",
			missingFontsCount: "{count} 种字体",
			closeDetails: "关闭字体详情",
			unavailable: "Office 预览不可用。请在运行 DeepSeek Harness 的主机上启用文档预览服务。",
			invalid: "无法预览此 Office 文件。文件可能已损坏、受密码保护，或与扩展名不符。",
			tooLarge: "Office 文件或转换后的 PDF 超过预览大小上限，请缩小文件或调整预览配置。",
			failed: "Office 转换失败，未生成可用的 PDF。请检查该文件后重试。",
			timeout: "Office 转换超时，请重试。",
			busy: "Office 预览任务较多，请稍后重试。",
			changed: "文件在读取时已更改，请重新打开预览。"
		};
		/** English translations checked against the Chinese key set. */
		const en = {
			title: "Office document",
			loading: "Reading…",
			retry: "Retry",
			missingFonts: "Fonts used in this document are unavailable: {fonts}. Text and layout may differ.",
			fontDiagnosticsUnavailable: "Font availability was not checked for this preview. Text and layout may differ from the original.",
			showMore: "Show more",
			dismissNotice: "Dismiss font notice",
			missingFontsTitle: "Missing fonts",
			missingFontsDescription: "These fonts are unavailable for this preview. Text and layout may differ from the original document.",
			missingFontsCount: "Fonts: {count}",
			closeDetails: "Close font details",
			unavailable: "Office previews are unavailable. Enable the document preview service on the computer running DeepSeek Harness.",
			invalid: "This Office file cannot be previewed. It may be damaged, password protected, or have the wrong extension.",
			tooLarge: "The Office file or converted PDF exceeds the preview size limit. Reduce the file size or adjust the preview configuration.",
			failed: "Office conversion did not produce a usable PDF. Check the file and try again.",
			timeout: "Office conversion timed out. Try again.",
			busy: "Office preview is busy. Try again shortly.",
			changed: "The file changed while being read. Reopen the preview."
		};
		//#endregion
		//#region lib/types/client/office/cache.js
		/** Bounded successful results; each caller reauthorizes and checks source freshness before reuse. */
		var OfficePreviewCache = class {
			stat;
			convert;
			maxEntries;
			maxBytes;
			maxPending;
			maxReaders;
			currentGeneration;
			busy;
			ready = /* @__PURE__ */ new Map();
			pending = /* @__PURE__ */ new Map();
			bytes = 0;
			readers = 0;
			generation;
			generationQuery = 0;
			acceptedQuery = 0;
			superseded = /* @__PURE__ */ new Error();
			lifetime = new AbortController();
			tasks = /* @__PURE__ */ new Set();
			reads = /* @__PURE__ */ new Set();
			/**
			* @param stat - authorized source metadata lookup.
			* @param convert - Host render Remote returning binary PDF bytes borrowed read-only by callers.
			* @param maxEntries - maximum completed results retained.
			* @param maxBytes - maximum retained PDF byteLength.
			* @param maxPending - maximum unsettled Host conversion requests, including cancellation teardown.
			* @param maxReaders - maximum readers, including metadata lookups.
			* @param generation - current Host renderer generation, checked before cached reuse.
			* @param busy - localized capacity failure.
			*/
			constructor(stat, convert, maxEntries, maxBytes, maxPending, maxReaders, currentGeneration, busy) {
				this.stat = stat;
				this.convert = convert;
				this.maxEntries = maxEntries;
				this.maxBytes = maxBytes;
				this.maxPending = maxPending;
				this.maxReaders = maxReaders;
				this.currentGeneration = currentGeneration;
				this.busy = busy;
			}
			/**
			* Share a conversion without letting one caller cancel another caller's work.
			* Renderer replacement retries authorization once; repeated replacement reports localized capacity failure.
			* @param file - Session authorization scope and source path.
			* @param signal - this caller's lifetime.
			* @param priority - foreground preview or speculative read.
			* @returns current PDF bytes borrowed read-only, or a declared source-read failure; cancellation rejects.
			*/
			async read(file, signal, priority = "foreground") {
				signal.throwIfAborted();
				this.lifetime.signal.throwIfAborted();
				const readerLimit = priority === "background" ? this.maxReaders - 1 : this.maxReaders;
				if (this.readers >= readerLimit || priority === "background" && this.maxPending === 1) throw this.busy();
				this.readers++;
				const operation = this.lookup(file, signal, priority);
				this.reads.add(operation);
				try {
					return await operation;
				} finally {
					this.readers--;
					this.reads.delete(operation);
				}
			}
			async lookup(file, signal, priority) {
				for (let attempt = 0; attempt < 2; attempt++) try {
					return await this.lookupGeneration(file, signal, priority);
				} catch (error) {
					if (error !== this.superseded) throw error;
				}
				throw this.busy();
			}
			async lookupGeneration(file, signal, priority) {
				signal = AbortSignal.any([signal, this.lifetime.signal]);
				signal.throwIfAborted();
				const query = ++this.generationQuery;
				const generation = await this.currentGeneration(signal);
				signal.throwIfAborted();
				if (!generation.ok) return generation;
				if (query < this.acceptedQuery && generation.value !== this.generation) throw this.superseded;
				this.acceptedQuery = Math.max(query, this.acceptedQuery);
				if (generation.value !== this.generation) {
					this.generation = generation.value;
					this.ready.clear();
					this.bytes = 0;
					for (const pending of this.pending.values()) pending.controller.abort(this.superseded);
					this.pending.clear();
				}
				const metadata = await this.stat(file, signal);
				signal.throwIfAborted();
				if (!metadata.ok) return metadata;
				if (generation.value !== this.generation) throw this.superseded;
				const key = JSON.stringify([
					generation.value,
					file.sessionId,
					metadata.value.absolutePath,
					metadata.value.version
				]);
				const cached = this.ready.get(key);
				if (cached !== void 0) {
					this.ready.delete(key);
					this.ready.set(key, cached);
					return cached;
				}
				const pendingKey = JSON.stringify([key, priority]);
				let entry = this.pending.get(pendingKey);
				if (entry === void 0) {
					const pendingLimit = priority === "background" ? this.maxPending - 1 : this.maxPending;
					if (this.tasks.size >= pendingLimit) throw this.busy();
					const controller = new AbortController();
					const promise = Promise.resolve().then(() => {
						controller.signal.throwIfAborted();
						return this.convert(file, controller.signal, priority);
					}).then((result) => {
						controller.signal.throwIfAborted();
						if (generation.value === this.generation && result.ok && result.value.generation === generation.value && result.value.version === metadata.value.version && result.value.absolutePath === metadata.value.absolutePath) this.retain(key, result);
						return result;
					}).finally(() => {
						this.tasks.delete(promise);
						if (this.pending.get(pendingKey)?.controller === controller) this.pending.delete(pendingKey);
					});
					this.tasks.add(promise);
					entry = {
						controller,
						promise,
						users: 0
					};
					this.pending.set(pendingKey, entry);
				}
				const shared = entry;
				shared.users += 1;
				return new Promise((resolve, reject) => {
					let settled = false;
					const finish = () => {
						if (settled) return false;
						settled = true;
						signal.removeEventListener("abort", abort);
						shared.users -= 1;
						if (shared.users === 0 && this.pending.get(pendingKey) === shared) {
							this.pending.delete(pendingKey);
							shared.controller.abort();
						}
						return true;
					};
					const abort = () => {
						const reason = signal.reason;
						finish();
						reject(reason instanceof Error ? reason : new Error("Office preview cancelled", { cause: reason }));
					};
					signal.addEventListener("abort", abort, { once: true });
					shared.promise.then((result) => {
						if (finish()) resolve(result);
					}, (error) => {
						if (finish()) reject(error instanceof Error ? error : new Error("Office preview failed", { cause: error }));
					});
				});
			}
			/** Clear retained bytes, cancel outstanding conversions, and await their completion. */
			async dispose() {
				this.lifetime.abort();
				this.pending.clear();
				this.ready.clear();
				this.bytes = 0;
				await Promise.allSettled([...this.reads, ...this.tasks]);
			}
			retain(key, result) {
				const previous = this.ready.get(key);
				if (previous !== void 0) {
					this.ready.delete(key);
					this.bytes -= previous.value.data.byteLength;
				}
				const size = result.value.data.byteLength;
				if (size > this.maxBytes) return;
				while (this.ready.size >= this.maxEntries || this.bytes + size > this.maxBytes) {
					const oldest = this.ready.entries().next().value;
					this.ready.delete(oldest[0]);
					this.bytes -= oldest[1].value.data.byteLength;
				}
				this.ready.set(key, result);
				this.bytes += size;
			}
		};
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/office/FontNotice.module.css.mjs
		const css$1 = ".JqwYuG_space{background:var(--dsw-alias-bg-document-preview);flex:none;grid-template-rows:1fr;transition:grid-template-rows .18s,opacity .18s;display:grid}.JqwYuG_space[data-dismissed=true]{opacity:0;pointer-events:none;grid-template-rows:0fr}.JqwYuG_clip{min-height:0;overflow:hidden}.JqwYuG_notice{min-width:0;height:40px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-state-warn-tertiary);border:.5px solid var(--dsw-alias-state-warn-secondary);box-shadow:var(--dsw-elevation-panel);border-radius:10px;align-items:center;gap:6px;margin:12px 12px 0;padding:0 8px 0 12px;font-size:12px;line-height:1.5;display:flex}.JqwYuG_warning,.JqwYuG_anchor{flex:none}.JqwYuG_warning{color:var(--dsw-alias-state-warn-label)}.JqwYuG_message{white-space:nowrap;flex:1;min-width:0;position:relative;overflow:hidden}.JqwYuG_message>span{display:block;overflow:hidden}.JqwYuG_message[data-clipped=true]>span{mask-image:linear-gradient(90deg,#000 calc(100% - 44px),#0000 calc(100% - 12px))}.JqwYuG_message[data-clipped=true]:after{content:\"...\";position:absolute;top:0;right:0}.JqwYuG_notice .JqwYuG_more,.JqwYuG_notice .JqwYuG_close{color:inherit;background:0 0;flex:none;padding:0 4px;font-size:12px;line-height:1.5}.JqwYuG_notice .JqwYuG_more:hover,.JqwYuG_notice .JqwYuG_close:hover{background:var(--dsw-alias-interactive-bg-hover)}.JqwYuG_panel{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);z-index:100;box-sizing:border-box;width:min(340px,100vw - 24px);max-height:calc(100dvh - 24px);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);border:0;border-radius:12px;padding:16px;font-size:13px;line-height:1.6;position:fixed;overflow:auto}.JqwYuG_panelHeader{justify-content:space-between;align-items:center;gap:12px;display:flex}.JqwYuG_panelHeader h3{margin:0;font-size:14px;font-weight:600}.JqwYuG_description{color:var(--dsw-alias-label-secondary);margin:8px 0 16px}.JqwYuG_count{color:var(--dsw-alias-label-tertiary);margin:0 0 6px;font-size:12px}.JqwYuG_fonts{overflow-wrap:anywhere;margin:0;padding:0;list-style:none}.JqwYuG_fonts li{border-top:.5px solid var(--dsw-alias-border-l2);padding:8px 0}@media (prefers-reduced-motion:reduce){.JqwYuG_space{transition:none}}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/FontNotice.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var FontNotice_module_css_default = {
			"anchor": "JqwYuG_anchor",
			"clip": "JqwYuG_clip",
			"close": "JqwYuG_close",
			"count": "JqwYuG_count",
			"description": "JqwYuG_description",
			"fonts": "JqwYuG_fonts",
			"message": "JqwYuG_message",
			"more": "JqwYuG_more",
			"notice": "JqwYuG_notice",
			"panel": "JqwYuG_panel",
			"panelHeader": "JqwYuG_panelHeader",
			"space": "JqwYuG_space",
			"warning": "JqwYuG_warning"
		};
		//#endregion
		//#region lib/types/client/office/FontNotice.js
		/** Missing-font notice and a non-modal details panel for one source version. */
		/**
		* Show missing fonts; dismissal applies to the same source version while this component stays mounted.
		* @param props - source identity, converted content, and localized copy.
		* @returns a collapsible notice and its anchored details, or nothing when fonts are available.
		*/
		function FontNotice({ resourceAddress, sourceVersion, fonts, t }) {
			const identity = JSON.stringify([resourceAddress, sourceVersion]);
			const [dismissed, setDismissed] = (0, react.useState)();
			const [expanded, setExpanded] = (0, react.useState)();
			const visible = fonts.length > 0 && dismissed !== identity;
			const open = visible && expanded === identity;
			const root = (0, react.useRef)(null);
			const anchor = (0, react.useRef)(null);
			const panel = (0, react.useRef)(null);
			const message = (0, react.useRef)(null);
			const id = (0, react.useId)();
			const position = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: anchor,
				panelRef: panel,
				gap: 8,
				margin: 12
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(root, open, () => {
				setExpanded(void 0);
			}, panel);
			const closeDetails = () => {
				setExpanded(void 0);
				anchor.current?.querySelector("button")?.focus();
			};
			const positioned = position !== null;
			(0, react.useLayoutEffect)(() => {
				if (!open || !positioned) return;
				panel.current?.focus();
			}, [open, positioned]);
			(0, react.useLayoutEffect)(() => {
				const element = message.current;
				if (element === null) return;
				const label = element.firstElementChild;
				const measure = () => {
					element.dataset.clipped = String(label.scrollWidth > element.clientWidth);
				};
				measure();
				const observer = new ResizeObserver(measure);
				observer.observe(element);
				return () => {
					observer.disconnect();
				};
			}, [fonts, t]);
			if (fonts.length === 0) return null;
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
				className: FontNotice_module_css_default.space,
				"data-office-font-notice": true,
				"data-dismissed": !visible,
				"aria-hidden": !visible,
				...!visible ? { inert: "" } : {},
				children: (0, react_jsx_runtime.jsx)("div", {
					className: FontNotice_module_css_default.clip,
					children: (0, react_jsx_runtime.jsxs)("div", {
						ref: root,
						className: FontNotice_module_css_default.notice,
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, { className: FontNotice_module_css_default.warning }),
							(0, react_jsx_runtime.jsx)("span", {
								ref: message,
								className: FontNotice_module_css_default.message,
								role: "status",
								children: (0, react_jsx_runtime.jsx)("span", { children: t("missingFonts", { fonts: fonts.join(", ") }) })
							}),
							(0, react_jsx_runtime.jsx)("span", {
								ref: anchor,
								className: FontNotice_module_css_default.anchor,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									className: FontNotice_module_css_default.more,
									"aria-expanded": open,
									"aria-controls": open ? id : void 0,
									"aria-haspopup": "dialog",
									onClick: () => {
										setExpanded(open ? void 0 : identity);
									},
									children: t("showMore")
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								className: FontNotice_module_css_default.close,
								"aria-label": t("dismissNotice"),
								onClick: () => {
									setDismissed(identity);
									setExpanded(void 0);
								},
								icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {})
							})
						]
					})
				})
			}), open && (0, react_dom.createPortal)((0, react_jsx_runtime.jsxs)("div", {
				ref: panel,
				id,
				role: "dialog",
				"aria-labelledby": `${id}-title`,
				"aria-describedby": `${id}-description`,
				tabIndex: -1,
				className: FontNotice_module_css_default.panel,
				style: {
					...position,
					visibility: position === null ? "hidden" : void 0
				},
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						closeDetails();
					}
				},
				onBlur: (event) => {
					if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !anchor.current?.contains(event.relatedTarget)) setExpanded(void 0);
				},
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: FontNotice_module_css_default.panelHeader,
						children: [(0, react_jsx_runtime.jsx)("h3", {
							id: `${id}-title`,
							children: t("missingFontsTitle")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							"aria-label": t("closeDetails"),
							onClick: closeDetails,
							icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {})
						})]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						id: `${id}-description`,
						className: FontNotice_module_css_default.description,
						children: t("missingFontsDescription")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: FontNotice_module_css_default.count,
						children: t("missingFontsCount", { count: fonts.length })
					}),
					(0, react_jsx_runtime.jsx)("ul", {
						className: FontNotice_module_css_default.fonts,
						children: fonts.map((font) => (0, react_jsx_runtime.jsx)("li", { children: font }, font))
					})
				]
			}), document.body)] });
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/office/OfficeBody.module.css.mjs
		const css = ".Ku8BfW_body{flex-direction:column;height:100%;min-height:0;display:flex}.Ku8BfW_scrollport{flex:1;min-height:0;overflow:auto}";
		const tagId = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/OfficeBody.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var OfficeBody_module_css_default = {
			"body": "Ku8BfW_body",
			"scrollport": "Ku8BfW_scrollport"
		};
		//#endregion
		//#region lib/types/client/office/OfficeBody.js
		/** Office owns source loading, conversion failures, and font notices around the shared PDF view. */
		/**
		* Load one Office revision and preserve its result while its tab remains open.
		* @param props - renderer loading request, tab state, conversion callbacks, and PDF slot.
		* @returns conversion status or the font notice and PDF scrollport.
		*/
		function OfficeBody(props) {
			const { tab } = props.useTabInfo();
			const { actions, read, retainTab, describeFailure, resourceAddress, t } = props;
			const request = props.content.kind === "renderer" ? props.content : void 0;
			const revision = request?.revision;
			const held = props.useStore((state) => state.byTab[tab.id]);
			const view = held?.revision === revision ? held : void 0;
			const settled = view?.file !== void 0 || view?.failure !== void 0;
			(0, react.useEffect)(() => {
				retainTab(tab.id, tab.signal);
			}, [
				retainTab,
				tab.id,
				tab.signal
			]);
			(0, react.useEffect)(() => {
				if (revision === void 0 || settled || tab.signal.aborted) return;
				const controller = new AbortController();
				const signal = AbortSignal.any([controller.signal, tab.signal]);
				actions.loading(tab.id, revision);
				read(hostFileOf(resourceAddress), signal).then((result) => {
					if (signal.aborted) return;
					if (result.ok) actions.complete(tab.id, revision, result.value);
					else actions.failed(tab.id, revision, {
						code: result.error.code,
						message: describeFailure(result.error)
					});
				}, (error) => {
					if (!signal.aborted) actions.failed(tab.id, revision, {
						code: "gateway/internal",
						message: describeFailure({ message: error instanceof Error ? error.message : String(error) })
					});
				});
				return () => {
					controller.abort();
				};
			}, [
				revision,
				resourceAddress,
				tab.id,
				tab.signal,
				read,
				actions,
				describeFailure,
				settled
			]);
			const file = view?.file;
			(0, react.useEffect)(() => {
				if (file !== void 0) request?.loaded(file.version);
			}, [file, request?.loaded]);
			if (request === void 0) return null;
			if (view?.failure !== void 0) {
				const { name } = pathPartsOf(resourceAddress);
				return (0, react_jsx_runtime.jsxs)("div", {
					className: TextPreview_module_css_default.empty,
					"data-textpreview-failed": view.failure.code,
					children: [
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
							kind: (0, _deepseek_ai_dsh_client_ui_primitives.classifyFileType)(name),
							size: 36
						}),
						(0, react_jsx_runtime.jsx)("p", {
							className: TextPreview_module_css_default.emptyLine,
							children: view.failure.message
						}),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							onClick: request.reload,
							children: t("retry")
						})
					]
				});
			}
			if (file === void 0) return (0, react_jsx_runtime.jsx)(LoadingIndicator, {
				className: TextPreview_module_css_default.statusLine,
				label: t("loading")
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				className: OfficeBody_module_css_default.body,
				children: [file.fontDiagnostics === "unavailable" ? (0, react_jsx_runtime.jsx)("p", { role: "status", style: { margin: "8px 12px", padding: "8px 12px", fontSize: "12px", lineHeight: 1.5, borderRadius: "6px", color: "var(--dsw-alias-label-primary, #1f2937)", backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)" }, children: t("fontDiagnosticsUnavailable") }) : null, (0, react_jsx_runtime.jsx)(FontNotice, {
					resourceAddress,
					sourceVersion: file.version,
					fonts: file.missingFonts,
					t
				}), (0, react_jsx_runtime.jsx)("div", {
					className: OfficeBody_module_css_default.scrollport,
					ref: props.scrollportRef,
					children: props.renderSlot("sidebar.right.tab.document.office.pdf", {
						resourceAddress,
						content: {
							kind: "bytes",
							data: file.data
						},
						wrap: props.wrap,
						scrollportRef: props.scrollportRef
					}, {
						entryKey: "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/office",
						hookContext: props.useTabInfo
					})
				})]
			});
		}
		//#endregion
		//#region lib/types/client/office/store.js
		/** Loaded Office previews survive body remounts until reload or tab closure. */
		/**
		* Retain Office contents across body remounts within a Session.
		* @returns the tab-content store declaration.
		*/
		function createOfficeStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({ byTab: {} }),
				actions: {
					/** @param state - draft. @param tab - owning tab. @param revision - new content revision. */
					loading(state, tab, revision) {
						state.byTab[tab] = { revision };
					},
					/** @param state - draft. @param tab - owning tab. @param revision - completed revision. @param file - borrowed PDF bytes. */
					complete(state, tab, revision, file) {
						state.byTab[tab] = {
							revision,
							file
						};
					},
					/** @param state - draft. @param tab - owning tab. @param revision - failed revision. @param failure - displayable failure. */
					failed(state, tab, revision, failure) {
						state.byTab[tab] = {
							revision,
							failure
						};
					},
					/** @param state - draft. @param tab - closed tab. */
					forget(state, tab) {
						const { [tab]: _closed, ...remaining } = state.byTab;
						state.byTab = remaining;
					}
				}
			});
		}
		//#endregion
		//#region lib/types/client/office/index.js
		/**
		* Register Office previews with versioned PDF reuse and missing-font notices.
		* @param ctx - Client renderer registry, localized copy, and optional Host Remotes.
		* @param config - Resolved Office preview cache limits.
		*/
		function apply$1(ctx, config) {
			const id = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/office";
			const extensions = [
				"doc",
				"docx",
				"xls",
				"xlsx",
				"ppt",
				"pptx"
			];
			ctx.effect(() => ctx.locale.register("sidebarOffice", {
				zh,
				en
			}));
			const t = ctx.locale.bind("sidebarOffice");
			const unavailable = (_file, signal) => {
				signal.throwIfAborted();
				return Promise.reject(new Error(t("unavailable")));
			};
			let read = unavailable;
			ctx.effect(() => ctx.documentPreviews.register({
				id,
				extensions,
				binaryExtensions: extensions,
				priority: "builtin",
				title: () => t("title"),
				loading: "renderer",
				wrap: false
			}));
			const store = createOfficeStore();
			const retainTab = retainDocumentTabs(ctx);
			const documentT = ctx.locale.bind("sidebarDocumentPreview");
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
				name: "sidebar.right.tab.document",
				key: id,
				locale: "sidebarOffice",
				store,
				children: { "sidebar.right.tab.document.office.pdf": {
					kind: "keyed",
					scope: "session",
					inject: { hooks: { tabInfo: documentTabInfoFactory } }
				} },
				inject: (_sessionId, actions) => ({
					read: (file, signal) => read(file, signal),
					describeFailure: (failure) => "code" in failure ? failureLine(documentT, failure) : documentT("error.unavailable", { message: failure.message }),
					retainTab: (tabId, signal) => {
						retainTab(tabId, signal, actions.forget);
					}
				})
			}, OfficeBody)));
			const pdfPresentation = pdfBodyRegistration(ctx);
			ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document.office.pdf", () => ctx.slots.register({
				name: "sidebar.right.tab.document.office.pdf",
				key: id,
				locale: "sidebarPdf",
				...pdfPresentation
			}, LazyPdfBody)));
			ctx.inject([
				"remote",
				"remote.officeToPdf",
				"remote.workspaceFiles"
			], (scope) => {
				const convert = async (file, signal, priority) => {
					signal.throwIfAborted();
					const result = await scope.remote.officeToPdf.render(file.sessionId, file.path, priority, signal);
					signal.throwIfAborted();
					if (!result.ok) {
						if (result.error.code === "document-render/failed") throw new Error(t(conversionErrorKey(result.error.details.reason)), { cause: result.error });
						return result;
					}
					return {
						ok: true,
						value: {
							...documentFileBytes(result.value),
							missingFonts: result.value.missingFonts,
							fontDiagnostics: result.value.fontDiagnostics,
							generation: result.value.generation
						}
					};
				};
				const createCache = () => new OfficePreviewCache(async (file, signal) => {
					const authorized = await scope.remote.workspaceFiles.readBytes(file.sessionId, file.path, {
						offset: 0,
						length: 1
					}, signal);
					signal.throwIfAborted();
					if (!authorized.ok) return authorized;
					const metadata = await scope.remote.workspaceFiles.stat(file.sessionId, file.path, signal);
					if (metadata.ok && (authorized.value.absolutePath !== metadata.value.absolutePath || authorized.value.version !== metadata.value.version)) throw new Error(t("changed"));
					return metadata;
				}, convert, config.maxCachedEntries, config.maxCachedBytes, config.maxPending, config.maxReaders, async (signal) => {
					const result = await scope.remote.officeToPdf.generation(signal);
					signal.throwIfAborted();
					if (!result.ok) throw new Error(t("unavailable"), { cause: result.error });
					return result;
				}, () => new Error(t("busy")));
				let cache = createCache();
				const retired = /* @__PURE__ */ new Set();
				read = async (file, signal) => {
					const result = await cache.read(file, signal);
					if (!result.ok && (result.error.code === "gateway/invocation-unavailable" || result.error.code === "gateway/service-unavailable")) throw new Error(t("unavailable"), { cause: result.error });
					return result;
				};
				scope.on("connection/reset", () => {
					const previous = cache;
					cache = createCache();
					const closing = previous.dispose().finally(() => {
						retired.delete(closing);
					});
					retired.add(closing);
				});
				scope.effect(() => async () => {
					read = unavailable;
					await Promise.all([...retired, cache.dispose()]);
				});
			});
		}
		function conversionErrorKey(code) {
			switch (code) {
				case "input-too-large":
				case "output-too-large": return "tooLarge";
				case "invalid-document":
				case "unsupported-format": return "invalid";
				case "timeout": return "timeout";
				case "unavailable": return "unavailable";
				case "busy": return "busy";
				case "source-changed": return "changed";
				default: return "failed";
			}
		}
		//#endregion
		//#region ../../../vendor/cosmokit/lib/index.js
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
		//#region ../../../vendor/schemastery/lib/index.mjs
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
		//#region lib/types/config.js
		/** Cache limits shared by the Host configuration and browser document previews. */
		/** Deployment limits applied before Office preview registration. */
		const Config = Schema.object({ office: Schema.object({
			maxCachedEntries: Schema.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
			maxCachedBytes: Schema.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(64 * 1024 * 1024),
			maxPending: Schema.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
			maxReaders: Schema.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(32)
		}) });
		//#endregion
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "sidebarDocumentPreview";
		/**
		* Required browser services: the tab registry, the slot registry, copy, and the
		* Remote carrier with its `workspaceFiles` namespace.
		*/
		const inject = [
			"slots",
			"locale",
			"sidebarRightTabs",
			"remote",
			"remote.workspaceFiles"
		];
		/**
		* Client plugin body: register the type, its dictionaries, its body, and its chip title.
		* @param ctx - client root context carrying the registry, the slots, copy, and the Remote face.
		*/
		function apply(ctx) {
			const config = Config(globalThis.__DSH_DOCUMENT_PREVIEW_CONFIG__ ?? {});
			const previews = new DocumentPreviewRegistry();
			const disposePreviews = ctx.reflect.provide("documentPreviews", previews);
			ctx.effect(() => disposePreviews);
			ctx.effect(() => ctx.sidebarRightTabs.register(textDefinition()), "ui-sidebar-documentpreview: text type");
			ctx.effect(() => ctx.locale.register(NS, {
				zh: zh$6,
				en: en$6
			}), "ui-sidebar-documentpreview: dictionaries");
			const store = createTextStore();
			const face = textFace(createReadPage(ctx.remote), async (file, signal) => {
				const result = await ctx.remote.workspaceFiles.readAll(file.sessionId, file.path, signal);
				return result.ok ? {
					ok: true,
					value: documentFileBytes(result.value)
				} : result;
			});
			const source = {
				getSnapshot: previews.getSnapshot,
				subscribe: previews.subscribe
			};
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: TEXTPREVIEW_ID,
				locale: NS,
				store,
				children: { "sidebar.right.tab.document": {
					kind: "keyed",
					scope: "session",
					inject: { hooks: { tabInfo: documentTabInfoFactory } }
				} },
				inject: (sessionId, actions) => ({
					...face(sessionId, actions),
					hooks: { documentPreviews: source }
				})
			}, TextPreview)), "ui-sidebar-documentpreview: text body");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
				name: "sidebar.right.pane.tab.title",
				key: TEXTPREVIEW_ID
			}, TextTitle)), "ui-sidebar-documentpreview: text title");
			apply$7(ctx);
			apply$6(ctx);
			apply$5(ctx);
			apply$4(ctx);
			apply$3(ctx);
			apply$2(ctx);
			apply$1(ctx, config.office);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map