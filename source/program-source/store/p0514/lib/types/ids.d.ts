/** Compile-time task identity constructors. @module @deepseek-ai/dsh-task-checkpoint */
import type { TaskId as TaskIdentity, TaskStepId as StepIdentity, TaskOperationId as OperationIdentity } from './types.ts';
/** Public task identity type paired with its compile-time constructor. */
export type TaskId = TaskIdentity;
/** Public step identity type paired with its compile-time constructor. */
export type TaskStepId = StepIdentity;
/** Public operation identity type paired with its compile-time constructor. */
export type TaskOperationId = OperationIdentity;
/** Brand a task ID without granting authority or replacing boundary validation.
 * @param id - raw task identity.
 * @returns the same string branded as a task ID.
 */
export declare function TaskId(id: string): TaskIdentity;
/** Brand a task-local step key without replacing boundary validation.
 * @param id - raw step identity.
 * @returns the same string branded as a step ID.
 */
export declare function TaskStepId(id: string): StepIdentity;
/** Brand an attempt ID without granting retry authority.
 * @param id - raw operation identity.
 * @returns the same string branded as an operation ID.
 */
export declare function TaskOperationId(id: string): OperationIdentity;
