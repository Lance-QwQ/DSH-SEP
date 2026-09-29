/** Bounded, lossless plain JSON. Accessor hooks are never invoked. */
export class JsonBoundaryError extends Error {}

export function encodeJson(value, { maxBytes, maxDepth, maxNodes }) {
  const parts = []; const ancestors = new Set(); let bytes = 0; let nodes = 0;
  const fail = () => { throw new JsonBoundaryError('Value exceeds the plain JSON boundary'); };
  const add = (text) => {
    bytes += Buffer.byteLength(text);
    if (bytes > maxBytes) fail();
    parts.push(text);
  };
  const scalarString = (text) => {
    if (text.length > maxBytes) fail();
    add(JSON.stringify(text));
  };
  const visit = (item, depth) => {
    if (++nodes > maxNodes || depth > maxDepth) fail();
    if (item === null) return add('null');
    if (typeof item === 'string') return scalarString(item);
    if (typeof item === 'boolean') return add(item ? 'true' : 'false');
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0)) fail();
      return add(String(item));
    }
    if (typeof item !== 'object' || ancestors.has(item)) fail();
    const array = Array.isArray(item); const proto = Object.getPrototypeOf(item);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) fail();
    const keys = Reflect.ownKeys(item);
    if (keys.length > maxNodes + 1 || keys.some((key) => typeof key !== 'string')) fail();
    ancestors.add(item);
    if (array) {
      if (item.length > maxNodes || keys.length !== item.length + 1) fail();
      add('[');
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail();
        if (index) add(',');
        visit(descriptor.value, depth + 1);
      }
      add(']');
    } else {
      add('{');
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index]; const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail();
        if (index) add(',');
        scalarString(key); add(':'); visit(descriptor.value, depth + 1);
      }
      add('}');
    }
    ancestors.delete(item);
  };
  visit(value, 0);
  return parts.join('');
}
