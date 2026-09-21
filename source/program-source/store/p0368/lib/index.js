var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/index.ts
import z2 from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/guard.ts
import { Context } from "@deepseek-ai/cordis";
import { scopeOf } from "@deepseek-ai/dsh-scope";
import { assertSupportedJsonSchema, defineTool } from "@deepseek-ai/dsh-tools";
var DYNAMIC_TOOL = /* @__PURE__ */ Symbol("cordis-host-runner.dynamic-tool");
var SCHEMA_TYPES = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null", "object", "array", "json"]);
var VALID_TYPES = "'string' | 'number' | 'integer' | 'boolean' | 'null' | 'object' | 'array' | 'json'";
var ANNOTATION_KEYS = ["description", "title", "default", "examples"];
function isPlainRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || typeof prototype === "object" && Object.getPrototypeOf(prototype) === null && hasIntrinsicConstructor(prototype, "Object");
}
function hasIntrinsicConstructor(prototype, name) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
  const constructor = descriptor?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`;
  } catch {
    return false;
  }
}
function hasPlainArrayPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, "Array")) return false;
  const objectPrototype = Object.getPrototypeOf(prototype);
  return typeof objectPrototype === "object" && objectPrototype !== null && Object.getPrototypeOf(objectPrototype) === null && hasIntrinsicConstructor(objectPrototype, "Object");
}
function isDensePlainArray(value) {
  if (!Array.isArray(value) || !hasPlainArrayPrototype(value) || Reflect.ownKeys(value).length !== value.length + 1) {
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}
function assertSchemaContainerKeys(value, path) {
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key))) {
    throw new Error(`harness.defineTool ${path} must contain only own enumerable string keys`);
  }
}
function cloneJson(value, path) {
  const ancestors = /* @__PURE__ */ new Set();
  let root;
  const assign = (destination, item) => {
    if (destination.kind === "root") {
      root = item;
      return;
    }
    if (destination.kind === "array") {
      destination.target[destination.index] = item;
      return;
    }
    Object.defineProperty(destination.target, destination.key, {
      value: item,
      enumerable: true,
      configurable: true,
      writable: true
    });
  };
  const reject = (at) => {
    throw new Error(`${at} must be lossless JSON data (objects, arrays, strings, numbers, booleans, null) \u2014 not a class instance, function, Map/Set, Date, or undefined. Return a plain object built from the values you need, or \`return null\` when the caller needs no value back.`);
  };
  const tasks = [{ kind: "visit", value, path, destination: { kind: "root" } }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      ancestors.delete(task.source);
      continue;
    }
    if (task.kind === "array-item") {
      if (!Object.hasOwn(task.source, task.index)) reject(task.path);
      tasks.push({
        kind: "visit",
        value: task.source[task.index],
        path: `${task.path}[${task.index}]`,
        destination: { kind: "array", target: task.target, index: task.index }
      });
      continue;
    }
    const current = task.value;
    if (current === null || typeof current === "string" || typeof current === "boolean") {
      assign(task.destination, current);
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current) || Object.is(current, -0)) reject(task.path);
      assign(task.destination, current);
      continue;
    }
    if (typeof current !== "object" || ancestors.has(current)) reject(task.path);
    if (Array.isArray(current)) {
      if (!hasPlainArrayPrototype(current) || Reflect.ownKeys(current).length !== current.length + 1) reject(task.path);
      const output2 = [];
      assign(task.destination, output2);
      ancestors.add(current);
      tasks.push({ kind: "leave", source: current });
      for (let index = current.length - 1; index >= 0; index--) {
        tasks.push({ kind: "array-item", source: current, index, path: task.path, target: output2 });
      }
      continue;
    }
    if (!isPlainRecord(current)) reject(task.path);
    const record = current;
    if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(record, key))) {
      reject(task.path);
    }
    const output = {};
    assign(task.destination, output);
    ancestors.add(record);
    tasks.push({ kind: "leave", source: record });
    const entries = Object.entries(record);
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      if (entry === void 0) continue;
      tasks.push({
        kind: "visit",
        value: entry[1],
        path: `${task.path}.${entry[0]}`,
        destination: { kind: "object", target: output, key: entry[0] }
      });
    }
  }
  return root;
}
function copyAnnotations(value, output, path) {
  if (Object.hasOwn(value, "description")) output.description = value.description;
  if (Object.hasOwn(value, "title")) output.title = value.title;
  if (Object.hasOwn(value, "default")) output.default = cloneJson(value.default, `harness.defineTool ${path}.default`);
  if (Object.hasOwn(value, "examples")) output.examples = cloneJson(value.examples, `harness.defineTool ${path}.examples`);
}
function assertSchemaKeys(value, path, allowed) {
  assertSchemaContainerKeys(value, path);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`harness.defineTool ${path}.${key} is not supported by the unified schema DSL`);
  }
}
function normalizeParameterSchemaSpec(value, path = "parameters") {
  if (!isPlainRecord(value)) {
    throw new Error(`harness.defineTool ${path} must be a ParameterSchemaSpec object`);
  }
  if (value.type === "object") {
    assertSchemaKeys(value, path, ["type", "properties", "required", "additionalProperties", ...ANNOTATION_KEYS]);
    if (!isPlainRecord(value.properties)) {
      throw new Error(`harness.defineTool ${path}.properties must be an object of schemas`);
    }
    if (Object.hasOwn(value, "additionalProperties") && value.additionalProperties !== true) {
      throw new Error(`harness.defineTool ${path}.additionalProperties must be true or omitted because the implicit parameter root is open`);
    }
    if (Object.hasOwn(value, "required") && value.required === void 0) {
      throw new Error(`harness.defineTool ${path}.required must be an array of declared property names`);
    }
    const required = normalizeRequiredNames(value.required, value.properties, `${path}.required`);
    const rootAnnotations = {};
    copyAnnotations(value, rootAnnotations, path);
    return {
      spec: normalizePropertyMap(value.properties, path, required, true),
      ...Object.keys(rootAnnotations).length === 0 ? {} : { rootAnnotations }
    };
  }
  return { spec: normalizePropertyMap(value, path, /* @__PURE__ */ new Set(), false) };
}
function normalizeRequiredNames(value, properties, path) {
  if (value === void 0) return /* @__PURE__ */ new Set();
  if (!isDensePlainArray(value)) {
    throw new Error(`harness.defineTool ${path} must be an array of declared property names`);
  }
  const names = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.length; index++) {
    const name = value[index];
    if (typeof name !== "string") {
      throw new Error(`harness.defineTool ${path} must be an array of declared property names`);
    }
    names.add(name);
    if (!Object.hasOwn(properties, name)) throw new Error(`harness.defineTool ${path} names undeclared property ${JSON.stringify(name)}`);
  }
  return names;
}
function assignNormalizedValue(destination, value) {
  if (destination.kind === "property") {
    Object.defineProperty(destination.target, destination.key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else if (destination.kind === "item") {
    destination.target.items = value;
  } else {
    destination.target[destination.index] = value;
  }
}
function assignNormalizedMap(destination, value) {
  if (destination.kind === "root") destination.holder.value = value;
  else destination.target.properties = value;
}
function normalizePropertyMap(entries, path, requiredNames, raw) {
  const holder = {};
  const ancestors = /* @__PURE__ */ new Set();
  const tasks = [{
    kind: "map",
    entries,
    path,
    requiredNames,
    raw,
    destination: { kind: "root", holder }
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      ancestors.delete(task.value);
      continue;
    }
    if (task.kind === "map") {
      if (ancestors.has(task.entries)) throw new Error(`harness.defineTool ${task.path} is circular`);
      assertSchemaContainerKeys(task.entries, task.path);
      ancestors.add(task.entries);
      const spec = {};
      assignNormalizedMap(task.destination, spec);
      tasks.push({ kind: "leave", value: task.entries });
      const mapEntries = Object.entries(task.entries);
      for (let index = mapEntries.length - 1; index >= 0; index--) {
        const entry = mapEntries[index];
        if (entry === void 0) continue;
        tasks.push({
          kind: "value",
          value: entry[1],
          path: `${task.path}.${entry[0]}`,
          forceRequired: task.requiredNames.has(entry[0]),
          raw: task.raw,
          parameterProperty: true,
          destination: { kind: "property", target: spec, key: entry[0] }
        });
      }
      continue;
    }
    const { value, path: path2 } = task;
    if (!isPlainRecord(value)) {
      throw new Error(`harness.defineTool ${path2} must be a ParameterSchemaSpec property object`);
    }
    assertSchemaContainerKeys(value, path2);
    if (ancestors.has(value)) throw new Error(`harness.defineTool ${path2} is circular`);
    ancestors.add(value);
    const requiredKey = task.parameterProperty && !task.raw ? ["required"] : [];
    if (task.parameterProperty && task.raw && Object.hasOwn(value, "required") && value.type !== "object") {
      throw new Error(`harness.defineTool ${path2}.required belongs to the containing raw object schema`);
    }
    if (task.parameterProperty && !task.raw && Object.hasOwn(value, "required") && value.required !== true) {
      throw new Error(`harness.defineTool ${path2}.required must be true when present`);
    }
    const prop = {};
    assignNormalizedValue(task.destination, prop);
    tasks.push({ kind: "leave", value });
    if (task.forceRequired || value.required === true) prop.required = true;
    copyAnnotations(value, prop, path2);
    if (Object.hasOwn(value, "oneOf")) {
      assertSchemaKeys(value, path2, ["oneOf", ...requiredKey, ...ANNOTATION_KEYS]);
      if (!isDensePlainArray(value.oneOf) || value.oneOf.length < 2) {
        throw new Error(`harness.defineTool ${path2}.oneOf must contain at least two schemas`);
      }
      const oneOf = [];
      prop.oneOf = oneOf;
      for (let index = value.oneOf.length - 1; index >= 0; index--) {
        tasks.push({
          kind: "value",
          value: value.oneOf[index],
          path: `${path2}.oneOf[${index}]`,
          forceRequired: false,
          raw: task.raw,
          parameterProperty: false,
          destination: { kind: "one-of", target: oneOf, index }
        });
      }
      continue;
    }
    if (task.raw && !Object.hasOwn(value, "type")) {
      assertSchemaKeys(value, path2, ANNOTATION_KEYS);
      prop.type = "json";
      continue;
    }
    if (!SCHEMA_TYPES.has(value.type) || task.raw && value.type === "json") {
      throw new Error(`harness.defineTool ${path2} must declare a valid type: ${VALID_TYPES} (got ${JSON.stringify(value.type)})`);
    }
    const type = value.type;
    prop.type = type;
    switch (type) {
      case "object": {
        assertSchemaKeys(value, path2, ["type", "properties", "additionalProperties", ...requiredKey, ...task.raw ? ["required"] : [], ...ANNOTATION_KEYS]);
        if (!task.raw && (!Object.hasOwn(value, "additionalProperties") || typeof value.additionalProperties !== "boolean")) {
          throw new Error(`harness.defineTool ${path2}.additionalProperties must be explicitly true or false`);
        }
        if (task.raw && Object.hasOwn(value, "additionalProperties") && typeof value.additionalProperties !== "boolean") {
          throw new Error(`harness.defineTool ${path2}.additionalProperties must be a boolean`);
        }
        if (task.raw && Object.hasOwn(value, "required") && value.required === void 0) {
          throw new Error(`harness.defineTool ${path2}.required must be an array of declared property names`);
        }
        prop.additionalProperties = task.raw ? value.additionalProperties ?? true : value.additionalProperties;
        if (Object.hasOwn(value, "properties")) {
          const properties = value.properties;
          if (!isPlainRecord(properties)) throw new Error(`harness.defineTool ${path2}.properties must be an object of schemas`);
          const nestedRequired = task.raw ? normalizeRequiredNames(value.required, properties, `${path2}.required`) : /* @__PURE__ */ new Set();
          tasks.push({
            kind: "map",
            entries: properties,
            path: `${path2}.properties`,
            requiredNames: nestedRequired,
            raw: task.raw,
            destination: { kind: "properties", target: prop }
          });
        } else if (task.raw && value.required !== void 0) {
          normalizeRequiredNames(value.required, {}, `${path2}.required`);
        }
        break;
      }
      case "array":
        assertSchemaKeys(value, path2, ["type", "items", ...requiredKey, ...ANNOTATION_KEYS]);
        if (Object.hasOwn(value, "items")) {
          tasks.push({
            kind: "value",
            value: value.items,
            path: `${path2}.items`,
            forceRequired: false,
            raw: task.raw,
            parameterProperty: false,
            destination: { kind: "item", target: prop }
          });
        }
        break;
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        assertSchemaKeys(value, path2, ["type", "enum", "const", ...requiredKey, ...ANNOTATION_KEYS]);
        if (Object.hasOwn(value, "enum")) {
          if (!isDensePlainArray(value.enum) || value.enum.length === 0) {
            throw new Error(`harness.defineTool ${path2}.enum must be a non-empty array`);
          }
          prop.enum = cloneJson(value.enum, `harness.defineTool ${path2}.enum`);
        }
        if (Object.hasOwn(value, "const")) prop.const = cloneJson(value.const, `harness.defineTool ${path2}.const`);
        break;
      case "json":
        assertSchemaKeys(value, path2, ["type", ...requiredKey, ...ANNOTATION_KEYS]);
        break;
      /* v8 ignore next 2 -- SCHEMA_TYPES narrows this closed switch before dispatch. */
      default:
        throw new Error(`harness.defineTool ${path2} must declare a valid type: ${VALID_TYPES}`);
    }
  }
  return holder.value ?? {};
}
function markDynamicTool(tool) {
  Object.defineProperty(tool, DYNAMIC_TOOL, { value: true });
  return tool;
}
function assertDynamicTool(tool) {
  if (!isPlainRecord(tool) || tool[DYNAMIC_TOOL] !== true) {
    throw new Error("dynamic tool registration must use a tool returned by harness.defineTool(...)");
  }
}
function isContentBlockShape(value) {
  return isPlainRecord(value) && typeof value.type === "string";
}
var RETURN_PREVIEW_LIMIT = 120;
function describeReturn(value) {
  const json = JSON.stringify(value);
  return json.length > RETURN_PREVIEW_LIMIT ? `${json.slice(0, RETURN_PREVIEW_LIMIT)}\u2026` : json;
}
function assertRenderedContent(value) {
  if (Array.isArray(value) && value.every(isContentBlockShape)) {
    return value;
  }
  throw new Error(
    `output.render returned ${describeReturn(value)} \u2014 it must return an ARRAY of content blocks:
  \u2713 return [{ type: 'text', text: String(value) }]`
  );
}
function sandboxDefineTool(options) {
  if (!isPlainRecord(options)) throw new Error("harness.defineTool options must be an object");
  const normalized = normalizeParameterSchemaSpec(options.parameters);
  if (!isPlainRecord(options.output)) {
    throw new Error("harness.defineTool output must declare { schema, render, presentationMeta? }");
  }
  const output = options.output;
  if (typeof output.render !== "function") throw new Error("harness.defineTool output.render must be a function");
  if (output.presentationMeta !== void 0 && typeof output.presentationMeta !== "function") {
    throw new Error("harness.defineTool output.presentationMeta must be a function when present");
  }
  if (typeof options.execute !== "function") throw new Error("harness.defineTool execute must be a function");
  const schema = cloneJson(output.schema, "harness.defineTool output.schema");
  const rawExecute = options.execute;
  const rawRender = output.render;
  const rawPresentationMeta = output.presentationMeta;
  const erasedDefineTool = defineTool;
  const tool = erasedDefineTool({
    ...options,
    parameters: normalized.spec,
    output: {
      schema,
      render(args, value) {
        return assertRenderedContent(cloneJson(rawRender(args, value), "harness.defineTool output.render result"));
      },
      ...rawPresentationMeta !== void 0 ? {
        presentationMeta(args, value) {
          return cloneJson(rawPresentationMeta(args, value), "harness.defineTool output.presentationMeta result");
        }
      } : {}
    },
    async execute(args, exec) {
      return cloneJson(await rawExecute(args, exec), "harness.defineTool execute result");
    }
  });
  const parameters = { ...tool.parameters, ...normalized.rootAnnotations };
  assertSupportedJsonSchema(parameters);
  return markDynamicTool({
    ...tool,
    parameters
  });
}
function normalizeHandler(method, fn) {
  if (typeof method !== "string" || method.length === 0) {
    throw new Error("harness.handle(method, fn) needs a non-empty string method name");
  }
  if (typeof fn !== "function") {
    throw new Error(`harness.handle("${method}") needs a handler function as its second argument`);
  }
  const rawHandler = fn;
  return {
    method,
    handler: async (args) => cloneJson(await rawHandler(args), `harness.handle("${method}") result`)
  };
}
function sandboxRegisterTool(ctx, tool) {
  assertDynamicTool(tool);
  return ctx.tools.register(tool);
}
var CTX_VERBS = /* @__PURE__ */ new Set(["effect", "on", "once", "provide", "timeout", "interval", "setTimeout", "setInterval", "throttle", "debounce"]);
var TIMER_VERBS = /* @__PURE__ */ new Set(["timeout", "interval", "setTimeout", "setInterval", "throttle", "debounce"]);
function sandboxTools(ctx) {
  return {
    register: (tool) => sandboxRegisterTool(ctx, tool),
    schemas: () => ctx.tools.schemas(scopeOf(ctx)),
    get: (name) => ctx.tools.schemas(scopeOf(ctx)).find((schema) => schema.name === name)
  };
}
function denyContext(value, service, reportFailure) {
  if (value instanceof Context) {
    return rejectGuard(
      reportFailure,
      `service "${service}" returned a cordis Context, which the sandbox does not expose. Operate through your own plugin ctx (ctx.on / ctx.provide / ctx.tools.register) and the services you inject \u2014 never another context.`
    );
  }
  return value;
}
function guardedService(service, name, reportFailure) {
  return new Proxy(service, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return denyContext(value, name, reportFailure);
      return (...args) => {
        const result = Reflect.apply(value, target, args);
        if (result instanceof Promise) return result.then((v) => denyContext(v, name, reportFailure));
        return denyContext(result, name, reportFailure);
      };
    }
  });
}
function declaredInjects(ctx) {
  return new Set(Object.keys(ctx.fiber.inject));
}
function sandboxContext(ctx, reportFailure) {
  const tools = sandboxTools(ctx);
  const declared = declaredInjects(ctx);
  const denyRead = (prop) => {
    if (ctx.get(prop) !== void 0) {
      return rejectGuard(
        reportFailure,
        `service "${prop}" is not injected. Declare it: inject: ['${prop}', \u2026] on your plugin, so cordis parks this dynamic package if the provider later goes away.`
      );
    }
    return rejectGuard(
      reportFailure,
      `sandbox ctx does not expose "${prop}". Available: ctx.tools.register / ctx.on / ctx.provide / the timer helpers after injecting timer, and any service you declared in inject. Framework internals (root, fiber, registry, extend, plugin, \u2026) are withheld by design.`
    );
  };
  const readService = (name, requireDeclaration) => {
    if (name === "tools") return tools;
    if (requireDeclaration && !declared.has(name)) return denyRead(name);
    const service = denyContext(ctx.get(name), name, reportFailure);
    if (service === null || typeof service !== "object" && typeof service !== "function") return service;
    return guardedService(service, name, reportFailure);
  };
  const get = (name) => readService(name, false);
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "tools") return tools;
      if (prop === "get") return get;
      if (typeof prop !== "string") return void 0;
      if (CTX_VERBS.has(prop)) {
        return (...args) => {
          if (TIMER_VERBS.has(prop) && !declared.has("timer")) return denyRead("timer");
          const method = ctx[prop];
          return Reflect.apply(method, ctx, args);
        };
      }
      return readService(prop, true);
    },
    // A façade is not the real ctx; block writes rather than let package code
    // stash state on a throwaway object and think it persisted.
    set(_target, prop) {
      return rejectGuard(reportFailure, `sandbox ctx is read-only; cannot assign "${String(prop)}"`);
    },
    // `in` reflects reachability: the façade API plus DECLARED services
    // (whether or not currently live). Does not resolve/wrap — no throw.
    has: (_target, prop) => prop === "tools" || prop === "get" || typeof prop === "string" && (CTX_VERBS.has(prop) && (!TIMER_VERBS.has(prop) || declared.has("timer")) || declared.has(prop))
  });
}
function isPlugin(value) {
  if (typeof value === "function") return true;
  return typeof value === "object" && value !== null && typeof value.apply === "function";
}
function guardedPlugin(plugin, reportFailure) {
  if (typeof plugin === "function") {
    const functionPlugin = plugin;
    return {
      name: pluginName(plugin),
      apply(ctx, config) {
        return functionPlugin(sandboxContext(ctx, reportFailure), config);
      }
    };
  }
  const objectPlugin = plugin;
  return {
    ...plugin,
    apply(ctx, config) {
      return objectPlugin.apply(sandboxContext(ctx, reportFailure), config);
    }
  };
}
function rejectGuard(reportFailure, message) {
  const error = new Error(message);
  reportFailure(error);
  throw error;
}
function pluginName(plugin) {
  const named = plugin.name;
  if (typeof named === "string" && named.length > 0) return named;
  return "<anonymous>";
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/inspect-registry.ts
import { Service } from "@deepseek-ai/cordis";
import { snapshotJsonValue } from "@deepseek-ai/dsh-util-values";
import { assertSupportedJsonSchema as assertSupportedJsonSchema2, validateJsonSchemaValue } from "@deepseek-ai/dsh-tools";
var CordisInspectRegistryService = class extends Service {
  providers = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  clientManifest;
  nextRequest = 1;
  /** Register the process-global Host registry. */
  constructor(ctx) {
    super(ctx, "cordisInspect");
  }
  /**
   * Register one Host provider.
   * @param registration - manifest and local query handler.
   * @returns idempotent disposer.
   */
  register(registration) {
    const manifest = validateManifest(registration.manifest);
    if (this.providers.has(manifest.id)) throw new Error(`Host Cordis inspect provider "${manifest.id}" is already registered`);
    const stored = { ...registration, manifest };
    this.providers.set(manifest.id, stored);
    return () => {
      if (this.providers.get(manifest.id) === stored) this.providers.delete(manifest.id);
    };
  }
  /**
   * Replace the mirrored Client provider directory.
   * @param providers - complete Client manifest snapshot.
   */
  syncClientManifest(providers) {
    const ids = /* @__PURE__ */ new Set();
    const validated = providers.map((provider) => {
      const manifest = validateManifest(provider);
      if (ids.has(manifest.id)) throw new Error(`Client Cordis inspect manifest repeats provider "${manifest.id}"`);
      ids.add(manifest.id);
      return manifest;
    });
    this.clientManifest = Object.freeze(validated);
  }
  /**
   * Return the complete known Host and Client provider directory.
   * @returns Host providers followed by the Client providers.
   */
  list() {
    return [
      ...[...this.providers.values()].map((provider) => view("host", provider.manifest)),
      ...(this.clientManifest ?? []).map((provider) => view("client", provider))
    ];
  }
  /**
   * Execute one provider query on its owning platform.
   * @param platform - Host or Client runtime.
   * @param providerId - provider selected from {@link list}.
   * @param methodName - declared method name.
   * @param input - optional lossless JSON input.
   * @param agent - requesting Agent and scope.
   * @param signal - tool-call cancellation.
   * @returns provider JSON data.
   */
  async query(platform, providerId, methodName, input, agent, signal) {
    if (platform === "host") {
      const registration = this.providers.get(providerId);
      if (registration === void 0) throw new Error(`Host Cordis inspect provider "${providerId}" is not registered`);
      const method = findMethod(registration.manifest, methodName);
      validateInput("Host", providerId, method, input);
      signal.throwIfAborted();
      const data = await registration.query(methodName, input, { agent, signal });
      signal.throwIfAborted();
      return validateOutput("Host", providerId, method, data);
    }
    return await this.queryClient(providerId, methodName, input, agent, signal);
  }
  /**
   * Accept the first valid Client response for a pending query.
   * @param agent - Agent whose Session owns the query.
   * @param requestId - Pending Client query identity.
   * @param resolution - Client provider result or failure.
   * @returns whether this response settled the still-pending query.
   */
  resolveClientQuery(agent, requestId, resolution) {
    const pending = this.pending.get(requestId);
    if (pending === void 0 || pending.request.agentId !== agent.id) return { accepted: false };
    if (!resolution.ok) return { accepted: false };
    try {
      resolution = {
        ok: true,
        data: validateOutput("Client", pending.request.provider, pending.method, resolution.data)
      };
    } catch {
      return { accepted: false };
    }
    this.pending.delete(requestId);
    pending.settle(resolution);
    this.ctx.emit("cordis/inspect-query-resolved", { requestId });
    return { accepted: true };
  }
  async queryClient(providerId, methodName, input, agent, signal) {
    const provider = this.clientManifest?.find((candidate) => candidate.id === providerId);
    if (provider === void 0) throw new Error(`Client Cordis inspect provider "${providerId}" is not registered`);
    const method = findMethod(provider, methodName);
    validateInput("Client", providerId, method, input);
    signal.throwIfAborted();
    const requestId = `inspect-${this.nextRequest++}`;
    const request = {
      requestId,
      agentId: agent.id,
      provider: providerId,
      method: methodName,
      ...input === void 0 ? {} : { input }
    };
    const result = new Promise((resolve) => {
      this.pending.set(requestId, { request, method, settle: resolve });
    });
    const onAbort = () => {
      const pending = this.pending.get(requestId);
      if (pending === void 0) return;
      this.pending.delete(requestId);
      pending.settle({ ok: false, reason: "cancelled", message: `Client inspect query ${providerId}.${methodName} was cancelled` });
      this.ctx.emit("cordis/inspect-query-resolved", { requestId });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    else this.ctx.emit("cordis/inspect-query", request);
    try {
      const resolution = await result;
      if (!resolution.ok) throw new Error(`${providerId}.${methodName}: ${resolution.message}`);
      return resolution.data;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
};
function view(platform, manifest) {
  return { platform, ...manifest, methods: [...manifest.methods] };
}
function validateManifest(manifest) {
  if (manifest.id.trim() === "") throw new Error("Cordis inspect provider id must not be empty");
  if (manifest.description.trim() === "") throw new Error(`Cordis inspect provider "${manifest.id}" needs a description`);
  const names = /* @__PURE__ */ new Set();
  const methods = manifest.methods.map((method) => {
    if (method.name.trim() === "") throw new Error(`Cordis inspect provider "${manifest.id}" has an empty method name`);
    if (names.has(method.name)) throw new Error(`Cordis inspect provider "${manifest.id}" repeats method "${method.name}"`);
    if (method.description.trim() === "") throw new Error(`Cordis inspect method ${manifest.id}.${method.name} needs a description`);
    assertSupportedJsonSchema2(method.inputSchema);
    assertSupportedJsonSchema2(method.outputSchema);
    names.add(method.name);
    return Object.freeze({ ...method });
  });
  return Object.freeze({ ...manifest, methods: Object.freeze(methods) });
}
function findMethod(manifest, name) {
  const method = manifest.methods.find((candidate) => candidate.name === name);
  if (method === void 0) throw new Error(`Cordis inspect provider "${manifest.id}" has no method "${name}"`);
  return method;
}
function validateInput(platform, provider, method, input) {
  const violations = validateJsonSchemaValue(method.inputSchema, input ?? {}, "input");
  if (violations.length > 0) throw new Error(`${platform} Cordis inspect ${provider}.${method.name} rejected input: ${violations.join("; ")}`);
}
function validateOutput(platform, provider, method, data) {
  const snapshot = snapshotJsonValue(data);
  if (snapshot === void 0) throw new Error(`${platform} Cordis inspect ${provider}.${method.name} returned a non-JSON value`);
  const violations = validateJsonSchemaValue(method.outputSchema, snapshot, "output");
  if (violations.length > 0) throw new Error(`${platform} Cordis inspect ${provider}.${method.name} returned invalid output: ${violations.join("; ")}`);
  return snapshot;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/lifecycle.ts
async function startHostHalf(group, plugin, reportGuardFailure) {
  await group.await();
  const fiber = group.ctx.plugin(guardedPlugin(plugin, reportGuardFailure));
  try {
    await fiber.await();
  } catch (error) {
    await fiber.dispose();
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already registered")) {
      throw new Error(
        `${message} \u2014 to REPLACE something an earlier dynamic package registered, first stop that package through its runner or the Cordis panel before running the new version.`
      );
    }
    throw error instanceof Error ? error : new Error(message);
  }
  return fiber;
}
function missingServices(ctx, fiber) {
  return Object.keys(fiber.inject).filter((service) => ctx.get(service) === void 0);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/registry.ts
import { randomUUID } from "node:crypto";
var DynamicCordisRegistry = class {
  incarnation = randomUUID().replaceAll("-", "");
  plugins = /* @__PURE__ */ new Map();
  pendingRequests = /* @__PURE__ */ new Map();
  nextPlugin = 1;
  nextPackage = 1;
  nextRun = 1;
  nextApproval = 1;
  /**
   * Mint a semantic plugin ID without reusing a prior suffix.
   * @param prefix - validated lowercase semantic prefix proposed by the model.
   * @returns a process-unique Plugin ID.
   */
  mintPluginId(prefix) {
    let id;
    do
      id = `${prefix}-${this.incarnation}-${this.nextPlugin++}`;
    while (this.plugins.has(id));
    return id;
  }
  /**
   * Mint an immutable package ID.
   * @returns a process-unique Package ID.
   */
  mintPackageId() {
    return `pkg-${this.incarnation}-${this.nextPackage++}`;
  }
  /**
   * Mint an activation ID.
   * @returns a process-unique Plugin Run ID.
   */
  mintPluginRunId() {
    return `run-${this.incarnation}-${this.nextRun++}`;
  }
  /**
   * Mint an approval ID.
   * @returns a process-unique approval request ID.
   */
  mintApprovalRequestId() {
    return `approval-${this.incarnation}-${this.nextApproval++}`;
  }
  /**
   * Add one stable plugin.
   * @param plugin - Plugin record to retain under its stable ID.
   */
  add(plugin) {
    this.plugins.set(plugin.pluginId, plugin);
  }
  /**
   * Read one plugin.
   * @param id - stable Plugin ID.
   * @returns the Plugin record, or `undefined` when absent.
   */
  get(id) {
    return this.plugins.get(id);
  }
  /**
   * Delete one plugin and all package versions.
   * @param id - stable Plugin ID to remove.
   * @returns whether a Plugin record was removed.
   */
  delete(id) {
    return this.plugins.delete(id);
  }
  /**
   * Read all plugins in creation order.
   * @returns a snapshot of every Plugin record.
   */
  all() {
    return [...this.plugins.values()];
  }
  /**
   * Read one session's plugins in creation order.
   * @param sessionId - owning session to filter by.
   * @returns a snapshot of matching Plugin records.
   */
  ofSession(sessionId) {
    return this.all().filter((plugin) => plugin.sessionId === sessionId);
  }
  /**
   * Publish one pending approval.
   * @param id - approval request ID.
   * @param pending - resolver and Plugin metadata retained until settlement.
   */
  armRequest(id, pending) {
    this.pendingRequests.set(id, pending);
  }
  /**
   * Read one pending approval without claiming it.
   * @param id - approval request ID.
   * @returns the pending request, or `undefined` when absent.
   */
  peekRequest(id) {
    return this.pendingRequests.get(id);
  }
  /**
   * Claim one pending approval; first answer wins.
   * @param id - approval request ID.
   * @returns the claimed request, or `undefined` when already settled.
   */
  claimRequest(id) {
    const pending = this.pendingRequests.get(id);
    if (pending !== void 0) this.pendingRequests.delete(id);
    return pending;
  }
  /**
   * Cancel one pending approval.
   * @param id - approval request ID to remove.
   */
  disarmRequest(id) {
    this.pendingRequests.delete(id);
  }
  /**
   * Find a pending approval for one Plugin.
   * @param pluginId - stable Plugin ID.
   * @returns its approval request ID, or `undefined` when none is pending.
   */
  pendingRequestFor(pluginId) {
    for (const [requestId, request] of this.pendingRequests) {
      if (request.pluginId === pluginId) return requestId;
    }
    return void 0;
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/persistence.ts
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import { link, lstat, open, opendir, realpath, unlink } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { withProtectedDirectory } from "@deepseek-ai/dsh-fs-local";
import { z } from "zod";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/sandbox.ts
import { createContext, runInContext, Script } from "node:vm";
var HOST_BUILTIN_INSPECTION = [
  {
    name: "ctx",
    description: "Restricted Cordis Context. Prefer ctx.get(name) with an undefined check; use inject for hard dependencies.",
    signatures: [
      "ctx.get(name: string): unknown | undefined",
      "ctx.on(name: string, listener: Function): () => void",
      "ctx.provide(name: string, value: unknown): () => void",
      "ctx.effect(callback: Function, label?: string): () => void"
    ]
  },
  {
    name: "harness",
    description: "Host helpers for Package-private Client RPC and model-visible dynamic Tools.",
    signatures: [
      "harness.handle(method: string, handler: (args: JsonValue) => JsonValue | Promise<JsonValue>): () => void",
      "harness.defineTool(definition: ToolDefinition): ToolDefinition",
      "harness.registerTool(ctx: Context, tool: ToolDefinition): () => void"
    ]
  },
  { name: "console", description: "Package-tagged Host logging.", signatures: ["console.log(...values): void", "console.error(...values): void"] },
  { name: "btoa", description: "Encode UTF-8 text as base64.", signatures: ["btoa(value: string): string"] },
  { name: "atob", description: "Decode base64 as UTF-8 text.", signatures: ["atob(value: string): string"] },
  { name: "TextEncoder", description: "Standard UTF-8 encoder constructor.", signatures: ["new TextEncoder()"] },
  { name: "TextDecoder", description: "Standard text decoder constructor.", signatures: ["new TextDecoder(label?: string)"] }
];
function taggedConsole(id) {
  const tag = `[cordis:${id}]`;
  const log = (...args) => {
    console.log(tag, ...args);
  };
  const error = (...args) => {
    console.error(tag, ...args);
  };
  return { log, info: log, warn: log, debug: log, error };
}
var DUAL_REALM_INSTANCEOF_PRELUDE = `
(hostIntrinsics) => {
  'use strict'
  const ordinary = Function.prototype[Symbol.hasInstance]
  for (const name of Object.keys(hostIntrinsics)) {
    const VmCtor = globalThis[name]
    const HostCtor = hostIntrinsics[name]
    if (typeof VmCtor !== 'function' || typeof HostCtor !== 'function') continue
    Object.defineProperty(VmCtor, Symbol.hasInstance, {
      value: (instance) => ordinary.call(VmCtor, instance) || ordinary.call(HostCtor, instance),
      configurable: true,
    })
  }
}
`;
function patchDualRealmInstanceof(sandbox) {
  const patch = runInContext(DUAL_REALM_INSTANCEOF_PRELUDE, sandbox);
  patch({ Object, Array, Function, Error, TypeError, RangeError, SyntaxError, Promise, RegExp, Date, Map, Set });
}
var TIMER_REDIRECT = "Node timers are unavailable. Use the cordis timer service instead: declare inject: ['timer'] on your plugin and call ctx.timeout / ctx.interval after querying Host Service.listService for the exact overloads. Those calls are fiber effects, cleaned up automatically when stopped.";
var NODE_API_REDIRECTS = {
  require: "Node modules are unavailable. Use the cordis services on ctx instead \u2014 e.g. inject: ['fs'] for files, ['web'] for HTTP, ['bash'] for processes; query Service.listService with cordis_inspect_query first.",
  setTimeout: TIMER_REDIRECT,
  setInterval: TIMER_REDIRECT,
  setImmediate: TIMER_REDIRECT,
  clearTimeout: TIMER_REDIRECT,
  clearInterval: TIMER_REDIRECT,
  fetch: "Network access goes through the cordis web service: declare inject: ['web'] and call ctx.web (query Host Service.listService with cordis_inspect_query for its methods)."
};
function nodeApiTraps() {
  const traps = {};
  for (const [name, redirect] of Object.entries(NODE_API_REDIRECTS)) {
    traps[name] = () => {
      throw new Error(`${name} is not available in the dynamic package sandbox \u2014 ${redirect}`);
    };
  }
  return traps;
}
function createSandbox(id, harnessExtras = {}) {
  const sandbox = {
    ...nodeApiTraps(),
    console: taggedConsole(id),
    harness: { defineTool: sandboxDefineTool, registerTool: sandboxRegisterTool, ...harnessExtras },
    // Web APIs absent from fresh vm contexts — made available so the model
    // can encode/decode base64 without Buffer (which is also absent). Host
    // closures over Buffer, never Buffer itself.
    btoa: (s) => Buffer.from(s, "utf-8").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("utf-8"),
    TextEncoder,
    TextDecoder
  };
  createContext(sandbox);
  patchDualRealmInstanceof(sandbox);
  return sandbox;
}
function isSyntaxError(error) {
  return typeof error === "object" && error !== null && error.name === "SyntaxError";
}
function syntaxErrorContext(error) {
  const lines = (error.stack ?? "").split("\n");
  const messageIndex = lines.findIndex((line) => line.startsWith("SyntaxError"));
  if (messageIndex === -1) return String(error);
  return lines.slice(0, messageIndex + 1).join("\n");
}
function parseErrorMessage(half, context) {
  const offendingLine = context.split("\n")[1] ?? "";
  if (/\bas\b/.test(offendingLine)) {
    return `dynamic package \`${half}\` failed to parse:
${context}
The sandbox runs plain JavaScript, not TypeScript. Remove type annotations:
  \u2717 { type: 'text' as const, text: x }
  \u2713 { type: 'text', text: x }`;
  }
  return `dynamic package \`${half}\` failed to parse:
${context}
Note: it runs as the BODY of an async function (line numbers are offset by the 1-line wrapper). Check bracket balance \u2014 ending the returned plugin object with \`});\` closes a call that was never opened; a plain \`return { \u2026 }\` ends with \`}\` (an optional \`;\`), never \`)\`.`;
}
function precheckCode(code, half) {
  const wrapped = `(async () => {
${code}
})()`;
  try {
    new Function(wrapped);
  } catch (error) {
    if (!isSyntaxError(error)) throw error;
    throw new Error(parseErrorMessage(half, prettyParseContext(wrapped, half, error)));
  }
}
function prettyParseContext(wrapped, half, refusal) {
  try {
    new Script(wrapped, { filename: `cordis-dyn-${half}.js` });
  } catch (vmError) {
    if (isSyntaxError(vmError)) return syntaxErrorContext(vmError);
  }
  return String(refusal);
}
async function evaluateHostCode(sandbox, code, id, vmTimeoutMs) {
  try {
    return await runInContext(
      `(async () => {
${code}
})()`,
      sandbox,
      { filename: `cordis-dyn-${id}.js`, timeout: vmTimeoutMs }
    );
  } catch (error) {
    if (!isSyntaxError(error)) throw error;
    throw new Error(parseErrorMessage("code.host", syntaxErrorContext(error)));
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/persistence.ts
var uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
var versionFile = new RegExp(`^(${uuid})\\.([1-9][0-9]*)\\.json$`);
var pendingFile = new RegExp(`^\\.pending-${uuid}$`);
var guardFile = /^\.dsh-protect-[0-9a-f-]+\.lock$/;
var scopeSchema = z.object({
  sessionId: z.string().min(1),
  projectRoot: z.string().min(1),
  storeRoot: z.string().min(1),
  permission: z.object({ preset: z.string().min(1), sandbox: z.string().min(1), approval: z.string().min(1) }).strict()
}).strict();
var envelopeSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.literal("cordis-js-function-body-v1"),
  durableId: z.string().regex(new RegExp(`^${uuid}$`)),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  scope: scopeSchema,
  name: z.string().min(1),
  purpose: z.string().min(1),
  code: z.object({ host: z.string().optional(), client: z.string().optional() }).strict().refine((code) => code.host !== void 0 || code.client !== void 0, "a source half is required")
}).strict();
function digest(value) {
  return createHash("sha256").update(JSON.stringify({ scope: value.scope, name: value.name, purpose: value.purpose, code: value.code })).digest("hex");
}
function equalScope(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function receipt(row) {
  return {
    status: "saved",
    active: false,
    durableId: row.durableId,
    version: row.version,
    sha256: row.sha256,
    name: row.name,
    purpose: row.purpose,
    hasHostHalf: row.code.host !== void 0,
    hasClientHalf: row.code.client !== void 0
  };
}
var PackagePersistence = class {
  constructor(ctx, runner, config, assertIdle) {
    this.ctx = ctx;
    this.runner = runner;
    this.config = config;
    this.assertIdle = assertIdle;
    if (!isAbsolute(config.root) || !isAbsolute(config.projectRoot)) throw new Error("Cordis persistence needs explicit absolute root and projectRoot");
    for (const key of ["maxVersionBytes", "maxTotalBytes", "maxPlugins", "maxVersions", "maxPendingFiles"]) {
      if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`Cordis persistence ${key} must be a positive safe integer`);
    }
    if (config.maxTotalBytes < config.maxVersionBytes) throw new Error("Cordis persistence total budget must fit one version");
    if (!Number.isSafeInteger(config.maxPlugins * config.maxVersions + config.maxPendingFiles + 2)) throw new Error("Cordis persistence entry budget is not a safe integer");
    ctx.effect(() => async () => {
      this.closed = true;
      await Promise.allSettled([...this.active]);
    }, "cordis saved-source operations");
  }
  ctx;
  runner;
  config;
  assertIdle;
  bindings = /* @__PURE__ */ new Map();
  busy = /* @__PURE__ */ new Set();
  active = /* @__PURE__ */ new Set();
  closed = false;
  /** Whether a source operation presently owns this live Plugin.
   * @param pluginId - exact current registry identity.
   * @returns whether lifecycle transitions and new calls must wait.
   */
  isBusy(pluginId) {
    return this.busy.has(pluginId);
  }
  operate(pluginId, job) {
    if (this.closed) return Promise.reject(new Error("Cordis persistence owner is disposed"));
    if (pluginId !== void 0) {
      if (this.busy.has(pluginId)) return Promise.reject(new Error("Cordis Plugin has a source operation in flight"));
      this.assertIdle(pluginId);
      this.busy.add(pluginId);
    }
    const task = Promise.resolve().then(job);
    this.active.add(task);
    return task.finally(() => {
      this.active.delete(task);
      if (pluginId !== void 0) this.busy.delete(pluginId);
    });
  }
  /** Recheck authority at every native activation entry, including the Client panel.
   * @param agent - current bound Session owner.
   * @param pluginId - exact current registry identity.
   */
  assertActivation(agent, pluginId) {
    const bound = [...this.bindings.values()].find((binding) => binding.pluginId === pluginId);
    if (bound === void 0) return;
    const permissions = this.ctx.get("permissionPresets");
    if (bound.agent !== agent || permissions === void 0) throw new Error("Cordis saved Plugin current Session or permission scope changed");
    const preset = permissions.current(agent.session), spec = permissions.resolve(preset);
    if (JSON.stringify({ preset, sandbox: spec.sandbox, approval: spec.approval }) !== JSON.stringify(bound.scope.permission)) throw new Error("Cordis saved Plugin permission scope changed");
  }
  /** Recheck the bound current owner after an asynchronous activation boundary.
   * @param pluginId - exact current registry identity.
   */
  assertActivationCurrent(pluginId) {
    const bound = [...this.bindings.values()].find((binding) => binding.pluginId === pluginId);
    if (bound !== void 0) this.assertActivation(bound.agent, pluginId);
  }
  async scope(agent) {
    const permissions = this.ctx.get("permissionPresets");
    if (permissions === void 0) throw new Error("Cordis persistence requires the current permission service");
    if (agent.id !== agent.session.id || agent.session.header.cwd === void 0) throw new Error("Cordis persistence requires a current Session with project metadata");
    const project = await realpath(this.config.projectRoot);
    if ((await realpath(agent.session.header.cwd)).toLowerCase() !== project.toLowerCase()) throw new Error("Cordis persistence project conflict");
    const preset = permissions.current(agent.session);
    const spec = permissions.resolve(preset);
    if (spec.sandbox !== "workspace-write" && spec.sandbox !== "danger-full-access") throw new Error("Cordis persistence requires a writable known permission scope");
    return {
      sessionId: String(agent.id),
      projectRoot: project.toLowerCase(),
      storeRoot: (await realpath(this.config.root)).toLowerCase(),
      permission: { preset, sandbox: spec.sandbox, approval: spec.approval }
    };
  }
  async entries() {
    const entries = [];
    const limit = this.config.maxPlugins * this.config.maxVersions + this.config.maxPendingFiles + 2;
    for await (const entry of await opendir(this.config.root)) {
      if (entries.length >= limit) throw new Error("Cordis persistence directory entry limit exceeded");
      entries.push(entry.name);
    }
    return entries;
  }
  async assertLinks(path, stat) {
    if (stat.nlink === 1) return;
    const name = basename(path);
    if (stat.nlink !== 2 || !versionFile.test(name) && !pendingFile.test(name)) throw new Error("Cordis persistence refuses foreign hard links");
    const matching = [];
    for (const entry of await this.entries()) {
      const other = await lstat(join(this.config.root, entry));
      if (other.isFile() && other.dev === stat.dev && other.ino === stat.ino) matching.push(entry);
    }
    if (matching.length !== 2 || matching.filter((entry) => versionFile.test(entry)).length !== 1 || matching.filter((entry) => pendingFile.test(entry)).length !== 1) throw new Error("Cordis persistence refuses foreign hard links");
  }
  async read(path) {
    if ((await lstat(path)).isSymbolicLink()) throw new Error("Cordis persistence refuses linked source");
    const handle = await open(path, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > this.config.maxVersionBytes) throw new Error("Cordis saved version is not a bounded regular file");
      await this.assertLinks(path, stat);
      const buffer = Buffer.alloc(this.config.maxVersionBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const chunk = await handle.read(buffer, length, buffer.length - length, length);
        if (chunk.bytesRead === 0) break;
        length += chunk.bytesRead;
      }
      if (length > this.config.maxVersionBytes) throw new Error("Cordis saved version exceeds byte limit");
      const bytes = buffer.subarray(0, length);
      const row = envelopeSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      if (digest(row) !== row.sha256) throw new Error("Cordis saved version checksum mismatch");
      if (row.code.host !== void 0) precheckCode(row.code.host, "code.host");
      if (row.code.client !== void 0) precheckCode(row.code.client, "code.client");
      return row;
    } finally {
      await handle.close();
    }
  }
  async scan(tolerateInvalid = false) {
    const files = await this.entries();
    const rows = [];
    const unavailable = [];
    let bytes = 0, pending = 0;
    const inodes = /* @__PURE__ */ new Set();
    for (const file of files) {
      const path = join(this.config.root, file), stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Cordis persistence contains an unsupported entry");
      await this.assertLinks(path, stat);
      if (file === ".dsh-directory.lock" || guardFile.test(file)) {
        if (stat.size !== 0) throw new Error("Cordis persistence lock is not empty");
        continue;
      }
      const inode = `${stat.dev}:${stat.ino}`;
      if (!inodes.has(inode)) bytes += stat.size;
      inodes.add(inode);
      if (bytes > this.config.maxTotalBytes) throw new Error("Cordis persistence total byte limit exceeded");
      if (pendingFile.test(file)) {
        if (++pending > this.config.maxPendingFiles) throw new Error("Cordis persistence pending file limit exceeded");
        continue;
      }
      const match = versionFile.exec(file);
      if (match === null || !Number.isSafeInteger(Number(match[2]))) throw new Error("Cordis persistence contains an unknown entry");
      try {
        const row = await this.read(path);
        if (row.durableId !== match[1] || row.version !== Number(match[2])) throw new Error("Cordis saved version identity mismatch");
        rows.push(row);
      } catch (error) {
        if (!tolerateInvalid) throw error;
        unavailable.push({
          status: "unavailable",
          durableId: match[1],
          version: Number(match[2]),
          message: "Saved source is invalid or unavailable. Keep its files; explicitly select a verified version."
        });
      }
    }
    return { rows, unavailable, bytes, pending };
  }
  /** Publish a bounded immutable source file, retaining incomplete staging on failure.
   * @param agent - current owner and authority scope.
   * @param request - exact runtime source and optional expected durable version.
   * @returns a committed receipt; no activation is requested.
   */
  async save(agent, request) {
    const inspected = this.runner.inspectPackage(agent, request.pluginId, request.packageId);
    return this.operate(request.pluginId, () => withProtectedDirectory(this.config.root, async () => {
      const scope = await this.scope(agent), inventory = await this.scan();
      if (inventory.pending >= this.config.maxPendingFiles) throw new Error("Cordis persistence pending file limit reached");
      const prior = [...this.bindings.entries()].find(([, bound]) => bound.pluginId === request.pluginId);
      if (prior === void 0 && (request.durableId !== void 0 || request.expectedVersion !== void 0)) throw new Error("Cordis save requires an existing durable identity before supplying a version expectation");
      if (prior !== void 0 && request.durableId !== prior[0]) throw new Error("Cordis save requires the existing durable identity and expected version");
      const id = request.durableId ?? randomUUID2();
      const existing = inventory.rows.filter((row2) => row2.durableId === id);
      const binding = this.bindings.get(id);
      if (existing.length > 0 && (binding?.agent !== agent || binding.pluginId !== request.pluginId || !equalScope(binding.scope, scope))) throw new Error("Cordis saved Plugin is not bound to this current Session");
      if (existing.some((row2) => !equalScope(row2.scope, scope))) throw new Error("Cordis saved scope conflict");
      const latest = Math.max(0, ...existing.map((row2) => row2.version));
      if (latest !== (request.expectedVersion ?? 0)) throw new Error("Cordis saved version conflict");
      if (existing.length >= this.config.maxVersions) throw new Error("Cordis saved version count limit reached");
      if (latest === 0 && new Set(inventory.rows.map((row2) => row2.durableId)).size >= this.config.maxPlugins) throw new Error("Cordis saved Plugin count limit reached");
      const content = { scope, name: inspected.name, purpose: inspected.purpose, code: inspected.code };
      const row = { schemaVersion: 1, format: "cordis-js-function-body-v1", durableId: id, version: latest + 1, sha256: digest(content), ...content };
      envelopeSchema.parse(row);
      const bytes = Buffer.from(JSON.stringify(row) + "\n");
      if (bytes.length > this.config.maxVersionBytes || bytes.length + inventory.bytes > this.config.maxTotalBytes) throw new Error("Cordis saved version exceeds storage byte limit");
      const pending = join(this.config.root, `.pending-${randomUUID2()}`);
      const destination = join(this.config.root, `${id}.${row.version}.json`);
      const handle = await open(pending, "wx");
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const staged = await this.read(pending);
      if (staged.sha256 !== row.sha256 || !equalScope(scope, await this.scope(agent))) throw new Error("Cordis saved scope changed before commit");
      this.runner.inspectPackage(agent, request.pluginId, request.packageId);
      this.assertIdle(request.pluginId);
      await link(pending, destination);
      await unlink(pending);
      const current = binding ?? { agent, pluginId: request.pluginId, scope, versions: /* @__PURE__ */ new Map() };
      current.versions.set(row.version, { packageId: request.packageId, sha256: row.sha256 });
      this.bindings.set(id, current);
      return receipt(row);
    }));
  }
  /** Read source-free descriptors under the configured native directory lease.
   * @param agent - current Session and project selection.
   * @returns bounded descriptors, including individually damaged entries.
   */
  async list(agent) {
    return this.operate(void 0, () => withProtectedDirectory(this.config.root, async () => {
      const scope = await this.scope(agent);
      const inventory = await this.scan(true);
      const rows = [...inventory.rows.filter((row) => equalScope(row.scope, scope)).map(receipt), ...inventory.unavailable];
      if (Buffer.byteLength(JSON.stringify({ versions: rows }, null, 2)) > this.config.maxTotalBytes) throw new Error("Cordis saved listing exceeds byte limit");
      return rows;
    }));
  }
  /** Validate one selected version and bind fresh runtime identities without running.
   * @param agent - exact current owner; another live Agent cannot reuse the binding.
   * @param request - durable identity, immutable version and expected digest.
   * @returns the deduplicated current registry binding.
   */
  async load(agent, request) {
    if (!new RegExp(`^${uuid}$`).test(request.durableId) || !Number.isSafeInteger(request.version) || request.version < 1 || !/^[0-9a-f]{64}$/.test(request.sha256)) throw new Error("Invalid saved Plugin selection");
    return this.operate(this.bindings.get(request.durableId)?.pluginId, () => withProtectedDirectory(this.config.root, async () => {
      const scope = await this.scope(agent);
      const row = await this.read(join(this.config.root, `${request.durableId}.${request.version}.json`));
      if (row.durableId !== request.durableId || row.version !== request.version || row.sha256 !== request.sha256) throw new Error("Cordis saved version identity or checksum conflict");
      if (!equalScope(row.scope, scope)) throw new Error("Cordis saved scope conflict");
      let binding = this.bindings.get(request.durableId);
      if (binding !== void 0 && (binding.agent !== agent || !equalScope(binding.scope, scope))) throw new Error("Cordis saved Plugin belongs to another current Session");
      const previous = binding?.versions.get(row.version);
      if (previous !== void 0 && previous.sha256 !== row.sha256) throw new Error("Cordis saved version changed since it was bound; keep its files and select a verified immutable version");
      if (binding !== void 0 && this.runner.reference(agent, binding.pluginId) === void 0) binding = void 0;
      let packageId = binding?.versions.get(row.version)?.packageId;
      if (packageId === void 0) {
        const defined = this.runner.define({
          sessionId: agent.id,
          plugin: binding === void 0 ? { kind: "new", idPrefix: "saved" } : { kind: "existing", pluginId: binding.pluginId },
          name: row.name,
          purpose: row.purpose,
          code: {
            ...row.code.host === void 0 ? {} : { host: row.code.host },
            ...row.code.client === void 0 ? {} : { client: row.code.client }
          }
        });
        binding ??= { agent, pluginId: defined.pluginId, scope, versions: /* @__PURE__ */ new Map() };
        packageId = defined.packageId;
        binding.versions.set(row.version, { packageId, sha256: row.sha256 });
        this.bindings.set(request.durableId, binding);
      }
      if (binding === void 0) throw new Error("Cordis saved binding was not established");
      return {
        status: "loaded",
        durableId: request.durableId,
        version: request.version,
        sha256: request.sha256,
        pluginId: binding.pluginId,
        packageId,
        active: this.runner.inspectPlugin(agent, binding.pluginId).activeRun?.packageId === packageId
      };
    }));
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/extensions/cordis-host-runner/src/index.ts
function CordisDynamicPluginId(id) {
  return id;
}
function CordisDynamicPackageId(id) {
  return id;
}
function CordisDynamicPluginRunId(id) {
  return id;
}
function ApprovalRequestId(id) {
  return id;
}
var _invoke_dec, _reportClientGuardFailure_dec, _reportRenderFailure_dec, _inventory_dec, _resolveInspectQuery_dec, _syncInspectManifest_dec, _stopFromPanel_dec, _settleUserRun_dec, _resolveRequestRun_dec, _getClientCode_dec, _runHostHalf_dec, _undefineFromPanel_dec, _a, _init;
var DynamicCordisRunnerService = class extends (_a = TypertRemoteService, _undefineFromPanel_dec = [Remote("undefineFromPanel")], _runHostHalf_dec = [Remote("runHostHalf")], _getClientCode_dec = [Remote("getClientCode")], _resolveRequestRun_dec = [Remote("resolveRequestRun")], _settleUserRun_dec = [Remote("settleUserRun")], _stopFromPanel_dec = [Remote("stopFromPanel")], _syncInspectManifest_dec = [Remote("syncInspectManifest")], _resolveInspectQuery_dec = [Remote("resolveInspectQuery")], _inventory_dec = [Remote("inventory")], _reportRenderFailure_dec = [Remote("reportRenderFailure")], _reportClientGuardFailure_dec = [Remote("reportClientGuardFailure")], _invoke_dec = [Remote("invoke")], _a) {
  /** Create the service under the Host composition. */
  constructor(ctx, config) {
    super(ctx, "dynamicCordisRunner");
    __runInitializers(_init, 5, this);
    __publicField(this, "rootCtx");
    __publicField(this, "registry", new DynamicCordisRegistry());
    __publicField(this, "inspectRegistry");
    __publicField(this, "starting", /* @__PURE__ */ new Map());
    __publicField(this, "resolved");
    __publicField(this, "group");
    __publicField(this, "persistence");
    this.rootCtx = ctx;
    this.resolved = config;
    this.inspectRegistry = new CordisInspectRegistryService(ctx);
    this.persistence = config.persistence === void 0 ? void 0 : new PackagePersistence(ctx, this, config.persistence, (id) => {
      this.assertPersistenceIdle(id);
    });
  }
  /** Whether this composition explicitly enabled bounded source persistence. */
  get persistenceEnabled() {
    return this.persistence !== void 0;
  }
  /** Save exact inspected source without running it.
   * @param agent - current owner and authority scope.
   * @param request - exact package and optional expected durable version.
   * @returns committed source receipt; activation remains separate.
   */
  async savePackage(agent, request) {
    if (this.persistence === void 0) throw new Error("Cordis persistence is disabled");
    this.assertPersistenceIdle(request.pluginId);
    return this.persistence.save(agent, request);
  }
  assertPersistenceIdle(pluginId) {
    if (this.registry.get(pluginId)?.run?.activeCalls || this.starting.has(pluginId) || this.registry.pendingRequestFor(pluginId) !== void 0) throw new Error("Cordis Plugin has work in flight");
  }
  /** List committed source descriptors visible to this Session.
   * @param agent - current owner and authority scope.
   * @returns bounded source-free committed version descriptors.
   */
  listSaved(agent) {
    if (this.persistence === void 0) throw new Error("Cordis persistence is disabled");
    return this.persistence.list(agent);
  }
  /** Load an exact saved version into the current registry without activation.
   * @param agent - current owner and authority scope.
   * @param request - durable identity, version and expected checksum.
   * @returns fresh runtime identities for an explicit run operation.
   */
  loadSaved(agent, request) {
    if (this.persistence === void 0) throw new Error("Cordis persistence is disabled");
    return this.persistence.load(agent, request);
  }
  /**
   * Define a new Plugin's first Package or append a Package to an existing Plugin.
   * @param request - Session ownership, Plugin selection, metadata, and source code.
   * @returns Host-minted Plugin and Package identities with declared-half metadata.
   */
  define(request) {
    const name = request.name.trim();
    const purpose = request.purpose.trim();
    if (name.length === 0) throw new Error("cordis_define needs a non-empty `name`");
    if (purpose.length === 0) throw new Error("cordis_define needs a non-empty `purpose`");
    if (request.code.host === void 0 && request.code.client === void 0) {
      throw new Error("cordis_define needs `code.host`, `code.client`, or both");
    }
    if (request.code.host !== void 0) precheckCode(request.code.host, "code.host");
    if (request.code.client !== void 0) precheckCode(request.code.client, "code.client");
    let plugin;
    if (request.plugin.kind === "new") {
      const prefix = request.plugin.idPrefix.trim();
      if (!/^[a-z]{3,6}$/.test(prefix)) {
        throw new Error("cordis_define `plugin.idPrefix` must contain 3\u20136 lowercase English letters");
      }
      const pluginId = CordisDynamicPluginId(this.registry.mintPluginId(prefix));
      plugin = {
        pluginId,
        sessionId: request.sessionId,
        packages: /* @__PURE__ */ new Map(),
        approvedClientPackages: /* @__PURE__ */ new Set(),
        clientVersionUpdatesApproved: false
      };
      this.registry.add(plugin);
    } else {
      const found = this.registry.get(request.plugin.pluginId);
      if (found === void 0 || found.sessionId !== request.sessionId) {
        throw new Error(missingPluginMessage(request.plugin.pluginId));
      }
      plugin = found;
    }
    const packageId = CordisDynamicPackageId(this.registry.mintPackageId());
    const definition = {
      packageId,
      name,
      purpose,
      ...request.code.host === void 0 ? {} : { hostCode: request.code.host },
      ...request.code.client === void 0 ? {} : { clientCode: request.code.client }
    };
    plugin.packages.set(packageId, definition);
    return {
      pluginId: plugin.pluginId,
      packageId,
      name,
      purpose,
      hasHostHalf: definition.hostCode !== void 0,
      hasClientHalf: definition.clientCode !== void 0
    };
  }
  /**
   * Remove a Plugin, its active run, and all immutable Packages.
   * @param agent - Agent whose Session must own the Plugin.
   * @param pluginId - Stable Plugin identity to remove.
   * @returns Whether removal succeeded and whether it stopped an active run.
   */
  async undefine(agent, pluginId) {
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) return { ok: false, reason: "plugin-missing", message: missingPluginMessage(pluginId) };
    if (plugin.run?.activeCalls || this.persistence?.isBusy(pluginId)) return { ok: false, reason: "transition-in-flight", message: "Cordis Plugin has work in flight" };
    const wasRunning = plugin.run !== void 0;
    this.cancelPending(pluginId, `dynamic plugin "${pluginId}" was removed before approval`);
    if (plugin.run !== void 0) await this.retract(plugin);
    this.registry.delete(pluginId);
    return { ok: true, wasRunning };
  }
  async undefineFromPanel(agent, pluginId) {
    const result = await this.undefine(agent, pluginId);
    if (result.ok) {
      this.injectUserContext(
        agent,
        `The user removed Cordis Plugin ${pluginId} and all of its Packages. The Plugin no longer exists.`
      );
    }
    return result;
  }
  /**
   * Start or update one Package for a model tool call. An unauthorized Client
   * Package waits for approval; Plugin-wide authorization covers later versions.
   * @param agent - Agent whose Session must own the Plugin.
   * @param pluginId - Stable Plugin identity to activate.
   * @param packageId - Immutable Package version to activate.
   * @param mode - Whether to run the current version or switch versions.
   * @param signal - Tool-call cancellation signal while the activation request is being created.
   * @returns The successful activation identity or an actionable refusal.
   */
  async run(agent, pluginId, packageId, mode, signal) {
    const plan = this.resolvePlan(agent, pluginId, packageId, mode);
    if (!plan.ok) return plan.response;
    if (signal?.aborted === true) {
      return {
        ok: false,
        reason: "cancelled",
        message: `the run request for dynamic plugin "${pluginId}" was cancelled before activation`
      };
    }
    if (this.registry.pendingRequestFor(pluginId) !== void 0) {
      return { ok: false, reason: "transition-in-flight", message: `dynamic plugin "${pluginId}" already has a pending run request` };
    }
    const attempt = this.createAttempt(plan);
    plan.plugin.nextPackageId = packageId;
    plan.plugin.latestRun = attempt;
    if (plan.definition.clientCode === void 0) {
      const started = await this.activate(plan, void 0, false, attempt);
      if (started.ok) return this.runResponse(plan.plugin, started);
      this.failAttempt(plan.plugin, attempt, "host-load", started);
      return { ...started, reason: "host-half-failed" };
    }
    const requestId = ApprovalRequestId(this.registry.mintApprovalRequestId());
    const requiresApproval = !plan.plugin.clientVersionUpdatesApproved && !plan.plugin.approvedClientPackages.has(packageId);
    attempt.approvalRequestId = requestId;
    attempt.requiresApproval = requiresApproval;
    attempt.status = requiresApproval ? "awaiting-approval" : "starting-host";
    this.registry.armRequest(requestId, {
      agentId: agent.id,
      pluginId,
      packageId,
      pluginRunId: attempt.pluginRunId,
      mode,
      requiresApproval
    });
    this.ctx.emit("cordis/request-run", {
      requestId,
      agentId: agent.id,
      pluginId,
      packageId,
      mode,
      name: plan.definition.name,
      purpose: plan.definition.purpose,
      requiresApproval
    });
    return {
      ok: true,
      status: requiresApproval ? "awaiting-approval" : "starting",
      pluginId,
      packageId,
      pluginRunId: attempt.pluginRunId,
      mode,
      waitingFor: [],
      ...plan.plugin.currentPackageId === void 0 ? {} : { currentPackageId: plan.plugin.currentPackageId },
      nextPackageId: packageId
    };
  }
  async runHostHalf(agent, pluginId, packageId, mode, requestId, approveFutureVersions) {
    const plan = this.resolvePlan(agent, pluginId, packageId, mode, requestId === null);
    if (!plan.ok) return { ok: false, message: plan.response.message };
    let attempt;
    if (requestId !== null) {
      const pending = this.registry.peekRequest(requestId);
      if (pending === void 0 || pending.pluginId !== pluginId || pending.packageId !== packageId || pending.mode !== mode) {
        return { ok: false, message: `run request "${requestId}" does not authorize ${pluginId}/${packageId}` };
      }
      const latest = plan.plugin.latestRun;
      const expectedStatus = pending.requiresApproval ? "awaiting-approval" : "starting-host";
      if (latest === void 0 || latest.pluginRunId !== pending.pluginRunId || latest.status !== expectedStatus && (!pending.requiresApproval && latest.status !== "client-pending")) {
        return { ok: false, message: `run request "${requestId}" no longer identifies the latest run of ${pluginId}` };
      }
      attempt = latest;
      if (pending.requiresApproval) {
        plan.plugin.approvedClientPackages.add(packageId);
        if (approveFutureVersions) plan.plugin.clientVersionUpdatesApproved = true;
      }
    } else {
      const pending = this.registry.pendingRequestFor(pluginId);
      if (pending !== void 0) return { ok: false, message: `dynamic plugin "${pluginId}" has pending run request ${pending}` };
      const attached = plan.plugin.run?.packageId === packageId && plan.plugin.latestRun?.pluginRunId === plan.plugin.run.pluginRunId ? plan.plugin.latestRun : void 0;
      attempt = attached ?? this.createAttempt(plan);
      if (attached === void 0) {
        plan.plugin.nextPackageId = packageId;
        plan.plugin.latestRun = attempt;
      }
      if (plan.definition.clientCode !== void 0) plan.plugin.approvedClientPackages.add(packageId);
    }
    const attaching = attempt.pluginRunId === plan.plugin.run?.pluginRunId;
    if (!attaching) {
      attempt.status = "starting-host";
      if (attempt.host.status !== "absent") attempt.host = { status: "pending", waitingFor: [] };
    }
    const started = await this.activate(plan, requestId ?? void 0, attaching, attempt);
    if (!started.ok) this.failAttempt(plan.plugin, attempt, "host-load", started);
    return started;
  }
  getClientCode(agent, pluginId, pluginRunId) {
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) throw new Error(missingPluginMessage(pluginId));
    const run = plugin.run;
    if (run === void 0 || run.pluginRunId !== pluginRunId) {
      throw new Error(`dynamic plugin "${pluginId}" is not running activation "${pluginRunId}"`);
    }
    const definition = plugin.packages.get(run.packageId);
    if (definition?.clientCode === void 0) throw new Error(`package "${run.packageId}" has no Client half`);
    return {
      code: definition.clientCode,
      name: definition.name,
      pluginId,
      packageId: run.packageId,
      pluginRunId
    };
  }
  async resolveRequestRun(requestId, resolution) {
    const pending = this.registry.peekRequest(requestId);
    if (pending === void 0) return { accepted: false };
    const plugin = this.registry.get(pending.pluginId);
    if (resolution.ok && plugin?.run?.pluginRunId !== resolution.pluginRunId) return { accepted: false };
    if (!resolution.ok && resolution.pluginRunId !== void 0 && plugin?.run?.pluginRunId !== resolution.pluginRunId) return { accepted: false };
    this.registry.claimRequest(requestId);
    const settled = await this.settleActivation(plugin, resolution, requestId);
    this.announceResolved(requestId, resolution, pending.requiresApproval ? void 0 : "completed");
    this.steerRunOutcome(pending, settled);
    return { accepted: true };
  }
  async settleUserRun(agent, pluginId, resolution) {
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) return { ok: false, reason: "plugin-missing", message: missingPluginMessage(pluginId) };
    const settled = await this.settleActivation(plugin, resolution);
    this.injectUserRunOutcome(agent, pluginId, settled);
    return settled;
  }
  /**
   * Stop the active run while retaining every Package version.
   * @param agent - Agent whose Session must own the Plugin.
   * @param pluginId - Stable Plugin identity to stop.
   * @returns Success or the reason no run was stopped.
   */
  async stop(agent, pluginId) {
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) return { ok: false, reason: "plugin-missing", message: missingPluginMessage(pluginId) };
    if (plugin.run?.activeCalls || this.persistence?.isBusy(pluginId)) return { ok: false, reason: "transition-in-flight", message: "Cordis Plugin has work in flight" };
    const pending = this.registry.pendingRequestFor(pluginId);
    if (plugin.run === void 0 && pending === void 0) {
      return { ok: false, reason: "not-running", message: `dynamic plugin "${pluginId}" is not running` };
    }
    if (pending !== void 0) this.cancelPending(pluginId, `dynamic plugin "${pluginId}" was stopped before approval`);
    if (plugin.run !== void 0) await this.retract(plugin);
    if (plugin.latestRun !== void 0) {
      plugin.latestRun.status = "stopped";
      if (plugin.latestRun.host.status !== "absent") plugin.latestRun.host = { status: "stopped", waitingFor: [] };
      if (plugin.latestRun.client.status !== "absent") plugin.latestRun.client = { status: "stopped", waitingFor: [] };
    }
    return { ok: true };
  }
  async stopFromPanel(agent, pluginId) {
    const result = await this.stop(agent, pluginId);
    if (!result.ok) return result;
    const plugin = this.owned(agent, pluginId);
    this.injectUserContext(
      agent,
      `The user stopped Cordis Plugin ${pluginId}. Its Packages remain defined; currentPackageId is ${plugin?.currentPackageId ?? "none"}.`
    );
    return result;
  }
  syncInspectManifest(providers) {
    this.inspectRegistry.syncClientManifest(providers);
    return null;
  }
  resolveInspectQuery(agent, requestId, resolution) {
    return this.inspectRegistry.resolveClientQuery(agent, requestId, resolution);
  }
  inventory() {
    return this.registry.all().map((plugin) => ({
      pluginId: plugin.pluginId,
      agentId: plugin.sessionId,
      packages: [...plugin.packages.values()].map((definition) => ({
        packageId: definition.packageId,
        name: definition.name,
        purpose: definition.purpose,
        hasHostHalf: definition.hostCode !== void 0,
        hasClientHalf: definition.clientCode !== void 0
      })),
      ...plugin.currentPackageId === void 0 ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === void 0 ? {} : { nextPackageId: plugin.nextPackageId },
      ...plugin.run === void 0 ? {} : {
        activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId }
      },
      ...plugin.latestRun === void 0 ? {} : { latestRun: cloneAttempt(plugin.latestRun) }
    }));
  }
  /* jscpd:ignore-end */
  /**
   * Read one Session's Host-rich state for inspection and result rendering.
   * @param agent - Agent whose Session selects visible Plugins.
   * @returns Plugin versions, active runs, Host fibers, and render failures.
   */
  snapshot(agent) {
    return this.registry.ofSession(agent.id).map((plugin) => ({
      pluginId: plugin.pluginId,
      ...plugin.currentPackageId === void 0 ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === void 0 ? {} : { nextPackageId: plugin.nextPackageId },
      packages: [...plugin.packages.values()].map((definition) => ({
        packageId: definition.packageId,
        name: definition.name,
        purpose: definition.purpose,
        hasHostHalf: definition.hostCode !== void 0,
        hasClientHalf: definition.clientCode !== void 0
      })),
      ...plugin.run === void 0 ? {} : {
        activeRun: {
          pluginRunId: plugin.run.pluginRunId,
          packageId: plugin.run.packageId,
          ...plugin.run.fiber === void 0 ? {} : { fiber: plugin.run.fiber },
          handlers: [...plugin.run.handlers.keys()],
          ...plugin.run.renderFailure === void 0 ? {} : { renderFailure: plugin.run.renderFailure }
        }
      },
      ...plugin.latestRun === void 0 ? {} : { latestRun: cloneAttempt(plugin.latestRun) }
    }));
  }
  /**
   * Read source-free context for an explicit `@pluginId` user gesture.
   * @param agent - Agent whose Session must own the Plugin.
   * @param pluginId - Stable Plugin identity referenced by the user.
   * @returns The preferred modification base, or undefined when unavailable.
   */
  reference(agent, pluginId) {
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) return void 0;
    const packageId = plugin.nextPackageId ?? plugin.currentPackageId ?? [...plugin.packages.keys()].at(-1);
    if (packageId === void 0) return void 0;
    const definition = plugin.packages.get(packageId);
    if (definition === void 0) return void 0;
    return {
      pluginId,
      packageId,
      name: definition.name,
      purpose: definition.purpose,
      ...plugin.currentPackageId === void 0 ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === void 0 ? {} : { nextPackageId: plugin.nextPackageId },
      ...plugin.run === void 0 ? {} : {
        activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId }
      },
      ...plugin.latestRun === void 0 ? {} : { latestRun: cloneAttempt(plugin.latestRun) }
    };
  }
  /**
   * List source-free Plugin summaries owned by one Session.
   * @param agent - Agent whose Session selects visible Plugins.
   * @returns one summary per Plugin in creation order.
   */
  listPlugins(agent) {
    return this.registry.ofSession(agent.id).map((plugin) => this.inspectPlugin(agent, plugin.pluginId));
  }
  /**
   * Inspect one Plugin without returning Package source.
   * @param agent - Agent whose Session must own the Plugin.
   * @param pluginId - stable Plugin identity.
   * @returns version pointers, latest run, and all Package summaries.
   */
  inspectPlugin(agent, pluginId) {
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) throw new Error(missingPluginMessage(pluginId));
    const reference = this.reference(agent, pluginId);
    if (reference === void 0) throw new Error(`dynamic plugin "${pluginId}" has no package`);
    return {
      ...reference,
      packages: [...plugin.packages.values()].map((definition) => ({
        packageId: definition.packageId,
        name: definition.name,
        purpose: definition.purpose,
        hasHostHalf: definition.hostCode !== void 0,
        hasClientHalf: definition.clientCode !== void 0
      }))
    };
  }
  /**
   * Read one exact immutable Package and its Host and Client source.
   * @param agent - Agent whose Session must own the Plugin.
   * @param pluginId - Stable Plugin identity that owns the Package.
   * @param packageId - Exact immutable Package identity to inspect.
   * @returns Package metadata, source, and the Plugin's lifecycle pointers.
   */
  inspectPackage(agent, pluginId, packageId) {
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) throw new Error(missingPluginMessage(pluginId));
    const definition = plugin.packages.get(packageId);
    if (definition === void 0) {
      throw new Error(`dynamic package "${packageId}" does not exist on plugin "${pluginId}"`);
    }
    return {
      pluginId,
      packageId,
      name: definition.name,
      purpose: definition.purpose,
      code: {
        ...definition.hostCode === void 0 ? {} : { host: definition.hostCode },
        ...definition.clientCode === void 0 ? {} : { client: definition.clientCode }
      },
      /* jscpd:ignore-start */
      ...plugin.currentPackageId === void 0 ? {} : { currentPackageId: plugin.currentPackageId },
      ...plugin.nextPackageId === void 0 ? {} : { nextPackageId: plugin.nextPackageId },
      ...plugin.run === void 0 ? {} : {
        activeRun: { pluginRunId: plugin.run.pluginRunId, packageId: plugin.run.packageId }
      },
      ...plugin.latestRun === void 0 ? {} : { latestRun: cloneAttempt(plugin.latestRun) }
      /* jscpd:ignore-end */
    };
  }
  async reportRenderFailure(agent, pluginId, pluginRunId, failure) {
    const plugin = this.owned(agent, pluginId);
    if (plugin?.run?.pluginRunId === pluginRunId) {
      const run = plugin.run;
      const definition = plugin.packages.get(plugin.run.packageId);
      const shouldSteer = run.renderFailure === void 0;
      run.renderFailure = failure;
      const attempt = plugin.latestRun;
      if (attempt?.pluginRunId === pluginRunId) {
        attempt.error = this.diagnostic(plugin, attempt, "client-render", failure);
        attempt.client = { status: "failed", waitingFor: attempt.client.waitingFor, error: failure.message };
        attempt.status = "failed";
      }
      if (definition !== void 0 && shouldSteer) {
        this.steerRenderFailure(agent, plugin, definition, pluginRunId, failure);
      }
    }
    return await Promise.resolve(null);
  }
  async reportClientGuardFailure(agent, pluginId, pluginRunId, failure) {
    const plugin = this.owned(agent, pluginId);
    const run = plugin?.run;
    if (plugin !== void 0 && run?.pluginRunId === pluginRunId) {
      this.steerGuardFailure(plugin, run, "Client", failure);
    }
    return await Promise.resolve(null);
  }
  async invoke(pluginId, pluginRunId, method, args) {
    const plugin = this.registry.get(pluginId);
    if (plugin === void 0 || plugin.run === void 0) {
      return { ok: false, code: "plugin-not-running", message: `dynamic plugin "${pluginId}" is not running` };
    }
    const run = plugin.run;
    if (run.pluginRunId !== pluginRunId) {
      return { ok: false, code: "stale-run", message: `activation "${pluginRunId}" is no longer active` };
    }
    if (this.persistence?.isBusy(pluginId)) return { ok: false, code: "transition-in-flight", message: "Cordis Plugin has a source operation in flight" };
    const handler = run.handlers.get(method);
    if (handler === void 0) {
      return { ok: false, code: "method-not-found", message: `dynamic plugin "${pluginId}" registered no Host method "${method}"` };
    }
    run.activeCalls += 1;
    try {
      return { ok: true, value: await handler(args) };
    } catch (error) {
      const failure = errorDetails(error);
      this.steerHostHandlerFailure(plugin, run, method, failure);
      return { ok: false, code: "handler-error", ...failure };
    } finally {
      run.activeCalls -= 1;
    }
  }
  resolvePlan(agent, pluginId, packageId, mode, allowActiveAttach = false) {
    this.persistence?.assertActivation(agent, pluginId);
    const plugin = this.owned(agent, pluginId);
    if (plugin === void 0) return { ok: false, response: { ok: false, reason: "plugin-missing", message: missingPluginMessage(pluginId) } };
    const readOnlyAttach = allowActiveAttach && mode === "run" && plugin.run?.packageId === packageId;
    if (this.persistence?.isBusy(pluginId) || plugin.run?.activeCalls && !readOnlyAttach) return { ok: false, response: { ok: false, reason: "transition-in-flight", message: "Cordis Plugin has work in flight" } };
    const definition = plugin.packages.get(packageId);
    if (definition === void 0) {
      return { ok: false, response: { ok: false, reason: "package-missing", message: `plugin "${pluginId}" has no package "${packageId}"` } };
    }
    const current = plugin.currentPackageId;
    if (mode === "update" && (current === void 0 || current === packageId)) {
      return {
        ok: false,
        response: {
          ok: false,
          reason: "invalid-mode",
          message: current === void 0 ? `plugin "${pluginId}" has no successful version yet; start "${packageId}" with mode "run"` : `package "${packageId}" is already current; use mode "run"`
        }
      };
    }
    if (mode === "run" && current !== void 0 && current !== packageId) {
      return {
        ok: false,
        response: {
          ok: false,
          reason: "invalid-mode",
          message: `package "${packageId}" differs from current "${current}"; use mode "update"`
        }
      };
    }
    if (!allowActiveAttach && this.starting.has(pluginId)) {
      return { ok: false, response: { ok: false, reason: "transition-in-flight", message: `plugin "${pluginId}" is already starting` } };
    }
    return { ok: true, plugin, definition, mode };
  }
  activate(plan, requestId, allowActiveAttach, attempt) {
    const inFlight = this.starting.get(plan.plugin.pluginId);
    if (inFlight !== void 0) return inFlight;
    const starting = this.startFresh(plan, requestId, allowActiveAttach, attempt);
    this.starting.set(plan.plugin.pluginId, starting);
    return starting.finally(() => {
      this.starting.delete(plan.plugin.pluginId);
    });
  }
  async startFresh(plan, requestId, allowActiveAttach, attempt) {
    const { plugin, definition, mode } = plan;
    if (allowActiveAttach && plugin.run?.packageId === definition.packageId && plugin.run.pluginRunId === attempt.pluginRunId) {
      return {
        ok: true,
        pluginId: plugin.pluginId,
        packageId: definition.packageId,
        pluginRunId: plugin.run.pluginRunId,
        waitingFor: missingFor(this.ctx, plugin.run),
        startedHere: false
      };
    }
    if (plugin.run !== void 0) await this.retract(plugin);
    if (mode === "update" || plugin.currentPackageId === void 0) plugin.nextPackageId = definition.packageId;
    const run = {
      activeCalls: 0,
      pluginRunId: attempt.pluginRunId,
      packageId: definition.packageId,
      handlers: /* @__PURE__ */ new Map(),
      handlerDisposers: [],
      reportedRuntimeErrors: /* @__PURE__ */ new Set(),
      ...requestId === void 0 ? {} : { startedForRequest: requestId }
    };
    if (definition.hostCode !== void 0) {
      const failure = await this.startHost(plugin, definition.hostCode, run);
      if (failure !== void 0) return { ok: false, ...failure };
    }
    try {
      this.persistence?.assertActivationCurrent(plugin.pluginId);
    } catch (error) {
      await run.fiber?.dispose();
      for (const dispose of run.handlerDisposers.splice(0)) dispose();
      return { ok: false, ...errorDetails(error) };
    }
    plugin.run = run;
    this.ctx.emit("cordis/dynamic-package", {
      pluginId: plugin.pluginId,
      packageId: definition.packageId,
      pluginRunId: run.pluginRunId,
      name: definition.name
    });
    attempt.host = {
      status: run.fiber === void 0 ? "absent" : missingFor(this.ctx, run).length === 0 ? "running" : "waiting",
      waitingFor: missingFor(this.ctx, run)
    };
    if (definition.clientCode === void 0) {
      this.commitActivation(plugin, run);
    } else {
      attempt.status = "client-pending";
      attempt.client = { status: "pending", waitingFor: [] };
    }
    return {
      ok: true,
      pluginId: plugin.pluginId,
      packageId: definition.packageId,
      pluginRunId: run.pluginRunId,
      waitingFor: missingFor(this.ctx, run),
      startedHere: true
    };
  }
  async startHost(plugin, hostCode, run) {
    const handle = (method, fn) => {
      const normalized = normalizeHandler(method, fn);
      run.handlers.set(normalized.method, normalized.handler);
      const dispose = () => {
        if (run.handlers.get(normalized.method) === normalized.handler) run.handlers.delete(normalized.method);
      };
      run.handlerDisposers.push(dispose);
      return dispose;
    };
    try {
      const sandbox = createSandbox(plugin.pluginId, { handle, defineTool: (options) => {
        const tool = sandboxDefineTool(options);
        const execute = tool.execute.bind(tool);
        tool.execute = async (...args) => {
          if (this.persistence?.isBusy(plugin.pluginId)) throw new Error("Cordis Plugin has a source operation in flight");
          run.activeCalls += 1;
          try {
            return await execute(...args);
          } finally {
            run.activeCalls -= 1;
          }
        };
        return tool;
      } });
      const evaluated = await evaluateHostCode(sandbox, hostCode, plugin.pluginId, this.resolved.vmTimeoutMs);
      if (!isPlugin(evaluated)) {
        throw new Error(evaluated === void 0 ? "the Host half returned `undefined` \u2014 did you forget `return`?" : "the Host half must return a Plugin function or an object with apply(ctx)");
      }
      run.fiber = await startHostHalf(
        this.requireGroup(),
        evaluated,
        (error) => {
          this.steerGuardFailure(plugin, run, "Host", errorDetails(error));
        }
      );
      return void 0;
    } catch (error) {
      for (const dispose of run.handlerDisposers.splice(0)) dispose();
      return errorDetails(error);
    }
  }
  async settleActivation(plugin, resolution, requestId) {
    if (plugin === void 0) return { ok: false, reason: "plugin-missing", message: "the dynamic plugin was removed during activation" };
    const attempt = plugin.latestRun;
    if (!resolution.ok) {
      if (resolution.reason === "rejected") {
        if (attempt !== void 0) {
          attempt.status = "rejected";
          attempt.error = this.diagnostic(plugin, attempt, "approval", resolution.message ?? "the run request was declined");
          attempt.client = { status: "stopped", waitingFor: [] };
        }
        return { ok: false, reason: "rejected", message: resolution.message ?? "the run request was declined" };
      }
      const run2 = plugin.run;
      const ownsRun = run2 !== void 0 && resolution.pluginRunId === run2.pluginRunId && (requestId === void 0 || run2.startedForRequest === requestId) && resolution.startedHere !== false;
      if (ownsRun) await this.retract(plugin);
      if (attempt !== void 0 && (resolution.pluginRunId === void 0 || attempt.pluginRunId === resolution.pluginRunId)) {
        this.failAttempt(
          plugin,
          attempt,
          resolution.reason === "host-half-failed" ? "host-apply" : "client-apply",
          {
            message: resolution.message ?? resolution.reason,
            ...resolution.stack === void 0 ? {} : { stack: resolution.stack }
          }
        );
      }
      return {
        ok: false,
        reason: resolution.reason,
        message: resolution.message ?? resolution.reason,
        ...resolution.stack === void 0 ? {} : { stack: resolution.stack }
      };
    }
    const run = plugin.run;
    if (run === void 0 || run.pluginRunId !== resolution.pluginRunId) {
      return { ok: false, reason: "client-half-failed", message: `activation "${resolution.pluginRunId}" is no longer active` };
    }
    try {
      this.persistence?.assertActivationCurrent(plugin.pluginId);
    } catch (error) {
      await this.retract(plugin);
      const failure = errorDetails(error);
      if (attempt !== void 0) this.failAttempt(plugin, attempt, "client-apply", failure);
      return { ok: false, reason: "client-half-failed", ...failure };
    }
    if (attempt !== void 0 && attempt.pluginRunId === run.pluginRunId) {
      attempt.client = {
        status: resolution.waitingFor === void 0 || resolution.waitingFor.length === 0 ? "running" : "waiting",
        waitingFor: resolution.waitingFor ?? []
      };
    }
    this.commitActivation(plugin, run);
    return {
      ...this.runResponse(plugin, {
        ok: true,
        pluginId: plugin.pluginId,
        packageId: run.packageId,
        pluginRunId: run.pluginRunId,
        waitingFor: missingFor(this.ctx, run),
        startedHere: false
      }),
      ...resolution.waitingFor === void 0 ? {} : { clientWaitingFor: resolution.waitingFor }
    };
  }
  commitActivation(plugin, run) {
    plugin.currentPackageId = run.packageId;
    delete plugin.nextPackageId;
    delete run.startedForRequest;
    const attempt = plugin.latestRun;
    if (attempt?.pluginRunId === run.pluginRunId) {
      attempt.status = attempt.host.status === "waiting" || attempt.client.status === "waiting" ? "waiting" : "running";
      delete attempt.approvalRequestId;
      delete attempt.requiresApproval;
      delete attempt.error;
    }
  }
  runResponse(plugin, started) {
    return {
      ok: true,
      status: "running",
      pluginId: plugin.pluginId,
      packageId: started.packageId,
      pluginRunId: started.pluginRunId,
      waitingFor: started.waitingFor,
      currentPackageId: started.packageId,
      mode: plugin.latestRun?.pluginRunId === started.pluginRunId ? plugin.latestRun.mode : "run"
    };
  }
  announceResolved(requestId, resolution, override) {
    const outcome = override ?? (resolution.ok ? "approved" : resolution.reason === "rejected" ? "rejected" : "failed");
    this.ctx.emit("cordis/request-run-resolved", { requestId, outcome });
  }
  steerRunOutcome(pending, settled) {
    const agents = this.rootCtx.get("agents");
    const agent = agents?.get(pending.agentId);
    if (agent === void 0) return;
    const plugin = this.registry.get(pending.pluginId);
    const identity = `${pending.pluginId}/${pending.packageId} (${pending.pluginRunId})`;
    let text;
    if (settled.ok) {
      text = `Cordis ${pending.mode} ${identity} completed successfully. currentPackageId is ${settled.currentPackageId ?? pending.packageId}. Continue using the running Plugin.`;
    } else if (settled.reason === "rejected") {
      text = `The user rejected Cordis ${pending.mode} ${identity}. Do not request the same activation again unless the user asks.`;
    } else {
      const returnedStatus = pending.requiresApproval ? "awaiting-approval" : "starting";
      text = `Cordis ${pending.mode} ${identity} failed after the runner returned ${returnedStatus}: ${settled.reason}
${formatErrorDetails(settled)}
currentPackageId: ${plugin?.currentPackageId ?? "none"}
nextPackageId: ${plugin?.nextPackageId ?? pending.packageId}
Report the failure to the user; the definition can be managed through the Cordis panel.`;
    }
    agent.steer(createUserMessage({
      content: [{ type: "text", text }],
      source: { kind: "plugin", plugin: "cordis-host-runner" }
    }));
  }
  steerRenderFailure(agent, plugin, definition, pluginRunId, failure) {
    agent.steer(createUserMessage({
      content: [{
        type: "text",
        text: `Cordis Client UI ${plugin.pluginId}/${definition.packageId} (${pluginRunId}) failed while rendering Slot "${failure.slot}" after activation.
${formatErrorDetails(failure)}
entryAbdicated: ${failure.abdicated}
Report the Client render failure to the user; the definition can be stopped through the Cordis panel.`
      }],
      source: { kind: "plugin", plugin: "cordis-host-runner" }
    }));
  }
  steerHostHandlerFailure(plugin, run, method, failure) {
    const reportKey = `Host\0handler\0${method}\0${failure.message}`;
    if (!this.claimRuntimeFailure(plugin, run, reportKey)) return;
    const agents = this.rootCtx.get("agents");
    const agent = agents?.get(plugin.sessionId);
    if (agent === void 0) return;
    agent.steer(createUserMessage({
      content: [{
        type: "text",
        text: `Cordis Host handler ${plugin.pluginId}/${run.packageId} (${run.pluginRunId}) failed when the Client called host.call(${JSON.stringify(method)}).
${formatErrorDetails(failure)}
The Plugin remains running. Report the Host handler failure to the user. If the handler needs a Service, either declare that Service in the returned Plugin inject list or read it with ctx.get(name) and handle undefined.`
      }],
      source: { kind: "plugin", plugin: "cordis-host-runner" }
    }));
  }
  /* jscpd:ignore-start */
  steerGuardFailure(plugin, run, platform, failure) {
    const reportKey = `${platform}\0guard\0${failure.message}`;
    if (!this.claimRuntimeFailure(plugin, run, reportKey)) return;
    const agents = this.rootCtx.get("agents");
    const agent = agents?.get(plugin.sessionId);
    if (agent === void 0) return;
    agent.steer(createUserMessage({
      content: [{
        type: "text",
        text: `Cordis ${platform} guard rejected runtime code in ${plugin.pluginId}/${run.packageId} (${run.pluginRunId}) after activation.
${formatErrorDetails(failure)}
The Plugin remains running. Report the guard rejection to the user; it can be stopped through the Cordis panel.`
      }],
      source: { kind: "plugin", plugin: "cordis-host-runner" }
    }));
  }
  /* jscpd:ignore-end */
  claimRuntimeFailure(plugin, run, key) {
    const attempt = plugin.latestRun;
    if (plugin.run !== run || attempt?.pluginRunId !== run.pluginRunId || attempt.status !== "running" && attempt.status !== "waiting") return false;
    if (run.reportedRuntimeErrors.has(key)) return false;
    run.reportedRuntimeErrors.add(key);
    return true;
  }
  injectUserRunOutcome(agent, pluginId, settled) {
    const plugin = this.owned(agent, pluginId);
    let text;
    if (settled.ok) {
      text = `The user manually ran Cordis Plugin ${pluginId}, Package ${settled.packageId}, as ${settled.pluginRunId}. The activation succeeded; currentPackageId is ${settled.currentPackageId}.`;
    } else {
      const attempt = plugin?.latestRun;
      text = `The user manually ran Cordis Plugin ${pluginId}${attempt === void 0 ? "" : `, Package ${attempt.packageId}, as ${attempt.pluginRunId}`}, but it failed: ${settled.reason}
${formatErrorDetails(settled)}
currentPackageId: ${plugin?.currentPackageId ?? "none"}
nextPackageId: ${plugin?.nextPackageId ?? "none"}`;
    }
    this.injectUserContext(agent, text);
  }
  injectUserContext(agent, text) {
    const agents = this.rootCtx.get("agents");
    if (agents?.get(agent.id) !== agent) return;
    agent.inject(createUserMessage({
      content: [{ type: "text", text }],
      source: { kind: "plugin", plugin: "cordis-host-runner" }
    }));
  }
  cancelPending(pluginId, message) {
    const requestId = this.registry.pendingRequestFor(pluginId);
    if (requestId === void 0) return;
    const pending = this.registry.claimRequest(requestId);
    if (pending === void 0) return;
    const plugin = this.registry.get(pluginId);
    if (plugin?.latestRun?.pluginRunId === pending.pluginRunId) {
      plugin.latestRun.status = "cancelled";
      plugin.latestRun.error = this.diagnostic(plugin, plugin.latestRun, "approval", message);
      delete plugin.latestRun.approvalRequestId;
      delete plugin.latestRun.requiresApproval;
    }
    this.announceResolved(requestId, { ok: false, reason: "rejected" }, "cancelled");
  }
  createAttempt(plan) {
    return {
      pluginRunId: CordisDynamicPluginRunId(this.registry.mintPluginRunId()),
      packageId: plan.definition.packageId,
      mode: plan.mode,
      status: "starting-host",
      host: {
        status: plan.definition.hostCode === void 0 ? "absent" : "pending",
        waitingFor: []
      },
      client: {
        status: plan.definition.clientCode === void 0 ? "absent" : "pending",
        waitingFor: []
      }
    };
  }
  failAttempt(plugin, attempt, phase, failure) {
    attempt.status = "failed";
    attempt.error = this.diagnostic(plugin, attempt, phase, failure);
    if (phase.startsWith("host")) attempt.host = { status: "failed", waitingFor: [], error: failure.message };
    else attempt.client = { status: "failed", waitingFor: [], error: failure.message };
  }
  diagnostic(plugin, attempt, phase, failure) {
    const details = typeof failure === "string" ? { message: failure } : failure;
    return {
      phase,
      ...details,
      pluginId: plugin.pluginId,
      packageId: attempt.packageId,
      pluginRunId: attempt.pluginRunId
    };
  }
  async retract(plugin) {
    const run = plugin.run;
    if (run === void 0) return;
    delete plugin.run;
    for (const dispose of run.handlerDisposers.splice(0)) dispose();
    if (run.fiber !== void 0) await run.fiber.dispose();
    this.ctx.emit("cordis/dynamic-retract", {
      pluginId: plugin.pluginId,
      packageId: run.packageId,
      pluginRunId: run.pluginRunId
    });
  }
  owned(agent, pluginId) {
    const plugin = this.registry.get(pluginId);
    return plugin?.sessionId === agent.id ? plugin : void 0;
  }
  requireGroup() {
    this.group ??= this.rootCtx.plugin({ name: "cordis-dynamic", apply: () => {
    } });
    return this.group;
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "undefineFromPanel", _undefineFromPanel_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "runHostHalf", _runHostHalf_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "getClientCode", _getClientCode_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "resolveRequestRun", _resolveRequestRun_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "settleUserRun", _settleUserRun_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "stopFromPanel", _stopFromPanel_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "syncInspectManifest", _syncInspectManifest_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "resolveInspectQuery", _resolveInspectQuery_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "inventory", _inventory_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "reportRenderFailure", _reportRenderFailure_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "reportClientGuardFailure", _reportClientGuardFailure_dec, DynamicCordisRunnerService);
__decorateElement(_init, 1, "invoke", _invoke_dec, DynamicCordisRunnerService);
__decoratorMetadata(_init, DynamicCordisRunnerService);
__publicField(DynamicCordisRunnerService, "inject", ["tools"]);
__publicField(DynamicCordisRunnerService, "Config", z2.object({
  vmTimeoutMs: z2.number().min(1).default(5e3),
  persistence: z2.union([z2.object({
    root: z2.string().required(),
    projectRoot: z2.string().required(),
    maxVersionBytes: z2.number().min(1).required(),
    maxTotalBytes: z2.number().min(1).required(),
    maxPlugins: z2.number().min(1).required(),
    maxVersions: z2.number().min(1).required(),
    maxPendingFiles: z2.number().min(1).required()
  }), z2.const(void 0)])
}));
function missingFor(ctx, run) {
  return run.fiber === void 0 ? [] : missingServices(ctx, run.fiber);
}
function missingPluginMessage(id) {
  return `no dynamic plugin "${id}" in this process \u2014 it may have been removed or lost on DSH restart`;
}
function errorDetails(error) {
  if (typeof error !== "object" || error === null) return { message: String(error) };
  const message = "message" in error && typeof error.message === "string" ? error.message : Object.prototype.toString.call(error);
  const stack = "stack" in error && typeof error.stack === "string" ? error.stack : void 0;
  return { message, ...stack === void 0 ? {} : { stack } };
}
function formatErrorDetails(failure) {
  return `message: ${failure.message}` + (failure.stack === void 0 ? "" : `
stack:
${failure.stack}`);
}
function cloneAttempt(attempt) {
  return {
    ...attempt,
    host: { ...attempt.host, waitingFor: [...attempt.host.waitingFor] },
    client: { ...attempt.client, waitingFor: [...attempt.client.waitingFor] },
    ...attempt.error === void 0 ? {} : { error: { ...attempt.error } }
  };
}
var index_default = DynamicCordisRunnerService;
export {
  ApprovalRequestId,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisInspectRegistryService,
  DynamicCordisRunnerService,
  HOST_BUILTIN_INSPECTION,
  index_default as default
};
//# sourceMappingURL=index.js.map
