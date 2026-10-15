import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
export type AssessmentStatus = 'pass' | 'fail' | 'blocked' | 'not_run';
export type AssessmentPhase = 'detected' | 'running' | 'complete' | 'interrupted';
type Verdict = 'unknown' | 'compatible' | 'incompatible';
type Reason = 'noCandidate' | 'staticIncompatible' | 'runtime' | 'boundEvidence';
export interface AssessmentView {
    version: 1;
    available: boolean;
    enabled: boolean;
    latest: null | {
        target: string;
        status: AssessmentStatus;
        phase: AssessmentPhase;
        analysis: AssessmentStatus;
        review: AssessmentStatus;
        summary: string;
        reason: string | null;
        plugins: {
            name: string;
            version: string;
            verdict: Verdict;
            reasons: Reason[];
        }[];
    };
    usage: null | {
        reportedRequests: number;
        promptTokens: number;
        completionTokens: number;
        estimatedCny: number;
        reservedCny: number;
        isProviderInvoice: false;
    };
}
export interface AssessmentApi {
    get(signal?: AbortSignal): Promise<AssessmentView>;
    update(enabled: boolean, signal?: AbortSignal): Promise<AssessmentView>;
    retry(signal?: AbortSignal): Promise<AssessmentView>;
}
/** Bounded typed projection prevents malformed wire results from becoming compatibility or cost claims. */
export declare function createAssessmentApi(rpc: ClientConnectionRpc): AssessmentApi;
export {};
//# sourceMappingURL=assessment-api.d.ts.map