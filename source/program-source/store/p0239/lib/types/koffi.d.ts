/** Process-realm lazy access to Koffi's CommonJS entry. */
import type koffi from 'koffi';
/** Koffi runtime export type. */
export type Koffi = typeof koffi;
/** Load Koffi on the first Win32 native operation. */
export declare const requireKoffi: () => {
    LibraryHandle: import("koffi").LibraryHandle;
    TypeObject: import("koffi").TypeObject;
    Union: import("koffi").Union;
    address: typeof import("koffi").address;
    alias: typeof import("koffi").alias;
    alignof: typeof import("koffi").alignof;
    alloc: typeof import("koffi").alloc;
    array: typeof import("koffi").array;
    as: typeof import("koffi").as;
    call: typeof import("koffi").call;
    config: typeof import("koffi").config;
    decode: typeof import("koffi").decode;
    disposable: typeof import("koffi").disposable;
    encode: typeof import("koffi").encode;
    enumeration: typeof import("koffi").enumeration;
    errno: typeof import("koffi").errno;
    extension: typeof import("koffi").extension;
    free: typeof import("koffi").free;
    inout: typeof import("koffi").inout;
    introspect: typeof import("koffi").introspect;
    load: typeof import("koffi").load;
    node: typeof import("koffi").node;
    offsetof: typeof import("koffi").offsetof;
    opaque: typeof import("koffi").opaque;
    os: typeof import("koffi").os;
    out: typeof import("koffi").out;
    pack: typeof import("koffi").pack;
    pointer: typeof import("koffi").pointer;
    proto: typeof import("koffi").proto;
    register: typeof import("koffi").register;
    reset: typeof import("koffi").reset;
    resolve: typeof import("koffi").resolve;
    sizeof: typeof import("koffi").sizeof;
    stats: typeof import("koffi").stats;
    struct: typeof import("koffi").struct;
    type: typeof import("koffi").type;
    types: typeof import("koffi").types;
    union: typeof import("koffi").union;
    unregister: typeof import("koffi").unregister;
    version: typeof import("koffi").version;
    view: typeof import("koffi").view;
};
//# sourceMappingURL=koffi.d.ts.map