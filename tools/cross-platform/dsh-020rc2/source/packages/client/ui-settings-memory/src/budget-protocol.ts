export interface BudgetDefaults { readonly limitCny: number; readonly revision: number }
export interface BudgetAvailableList {
 readonly version: 1; readonly available: true; readonly reason: string | null;
 readonly defaults: BudgetDefaults;
 readonly shared: { readonly limitCny: number; readonly accountedUpperBoundCny: number; readonly remainingCny: number };
 readonly taskLimitCny: number; readonly sessions: readonly { readonly id: string; readonly label: string }[];
}
export interface BudgetSnapshot {
 readonly version: 1; readonly rootSessionId: string; readonly limitCny: number; readonly revision: number; readonly usesDefault: boolean;
 readonly accountedUpperBoundCny: number; readonly settledCny: number; readonly reservedCny: number; readonly remainingCny: number;
 readonly unattributedSharedCny: number; readonly isProviderInvoice: false;
}
export interface BudgetSettingsApi {
 readonly list: (signal?: AbortSignal) => Promise<BudgetList>;
 readonly get: (sessionId: string, signal?: AbortSignal) => Promise<BudgetSnapshot>;
 readonly update: (sessionId: string, limitCny: number, expectedRevision: number, signal?: AbortSignal) => Promise<BudgetSnapshot>;
 readonly updateDefault: (limitCny: number, expectedRevision: number, signal?: AbortSignal) => Promise<BudgetDefaults>;
}

export interface BudgetUnavailableList { readonly version: 1; readonly available: false; readonly reason: string | null; readonly sessions: readonly { readonly id: string; readonly label: string }[] }
export type BudgetList = BudgetAvailableList | BudgetUnavailableList;
