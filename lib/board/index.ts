// Barrel re-exports for lib/board/ — tools schema + executor

export type { DrawToolName, DrawToolSchema, JSONSchemaProperty } from './tools'
export { drawTools } from './tools'
export type { ExecuteResult } from './executor'
export { executeToolCall } from './executor'
