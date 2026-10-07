import { Context, Service } from '@deepseek-ai/cordis';
import { type EntryOptions } from './entry.ts';
import { EntryTree } from './tree.ts';
/** Runtime owner for a list of child loader entries. */
export declare class EntryGroup {
    ctx: Context;
    tree: EntryTree;
    static readonly key: unique symbol;
    data: EntryOptions[];
    constructor(ctx: Context, tree: EntryTree);
    get context(): Context;
    create(options: Omit<EntryOptions, 'id'>): Promise<string>;
    unlink(options: EntryOptions): void;
    remove(id: string, isDispose?: boolean): void;
    update(config: EntryOptions[]): Promise<void>;
    stop(): void;
}
/** Plugin that mounts a nested loader entry group. */
export declare class Group extends EntryGroup {
    ctx: Context;
    config: EntryOptions[];
    static initial: Omit<EntryOptions, 'id'>[];
    static readonly [EntryGroup.key] = true;
    constructor(ctx: Context, config: EntryOptions[]);
    [Service.init](): AsyncGenerator<() => void, void, unknown>;
}
//# sourceMappingURL=group.d.ts.map