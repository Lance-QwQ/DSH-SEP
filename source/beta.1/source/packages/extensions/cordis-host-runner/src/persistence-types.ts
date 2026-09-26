/** Durable source snapshots; runtime and approval tokens never enter this format. @module */
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { CordisDynamicPackageId, CordisDynamicPluginId } from './types.ts';
/** Host-minted persistent Plugin identity, independent of a live registry. */
export type CordisSavedPluginId = Branded<'CordisSavedPluginId'>;
/** Explicit local draft storage; omitted configuration disables all disk operations. */
export interface PersistenceConfig {
    /** Existing dedicated directory; Windows x64 NTFS is required by its native lease. */
    root: string;
    /** Existing project directory matching the current Session's creation metadata. */
    projectRoot: string;
    /** Inclusive UTF-8 byte bound for each complete version envelope. */
    maxVersionBytes: number;
    /** Inclusive total file bytes, including incomplete staging files. */
    maxTotalBytes: number;
    /** Maximum number of distinct durable Plugin identities. */
    maxPlugins: number;
    /** Maximum immutable versions retained per Plugin. */
    maxVersions: number;
    /** Maximum retained incomplete publication files; one free slot is required to save. */
    maxPendingFiles: number;
}
/** Current-session request to save one exact inspected package. */
export interface SavePackageRequest {
    pluginId: CordisDynamicPluginId;
    packageId: CordisDynamicPackageId;
    /** Required for appending to an already saved Plugin. */
    durableId?: CordisSavedPluginId;
    /** Exact latest saved version expected before appending. */
    expectedVersion?: number;
}
/** Exact committed content selected for explicit current-session loading. */
export interface LoadSavedRequest {
    durableId: CordisSavedPluginId;
    version: number;
    sha256: string;
}
/** Source-free committed version descriptor. Saving does not activate a run. */
export interface SavedPackageReceipt extends LoadSavedRequest {
    status: 'saved';
    active: false;
    name: string;
    purpose: string;
    hasHostHalf: boolean;
    hasClientHalf: boolean;
}
/** Fresh runtime binding; activation remains a separate Runner operation. */
export interface LoadedPackageReceipt extends LoadSavedRequest {
    status: 'loaded';
    active: boolean;
    pluginId: CordisDynamicPluginId;
    packageId: CordisDynamicPackageId;
}
/** A damaged committed entry remains visible without exposing its untrusted contents. */
export interface UnavailableSavedPackage {
    status: 'unavailable';
    durableId: CordisSavedPluginId;
    version: number;
    message: string;
}
/** Metadata-only listing preserves individual failure state. */
export type SavedPackageListing = SavedPackageReceipt | UnavailableSavedPackage;
