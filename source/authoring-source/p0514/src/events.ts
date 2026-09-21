/** Required task checkpoint vocabulary. @module @deepseek-ai/dsh-task-checkpoint */
import type { TaskChange } from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Durable ordered task changes; older readers must refuse this required event. */
    'task/checkpoint-change': TaskChange
  }
}
