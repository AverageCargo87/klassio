// Barrel re-exports for lib/board/ — tools schema + executor + scenes (Phase 5)

export type { DrawToolName, DrawToolSchema, JSONSchemaProperty, SceneToolName, SceneToolSchema, BoardToolName } from './tools'
export { drawTools, sceneTools, allBoardTools } from './tools'
export type { ExecuteResult } from './executor'
export { executeToolCall } from './executor'
// Phase 5: scene types and registry
export type { SceneName, PrimitiveCall, PrimitiveName, SceneGenerator } from './scenes/types'
export { isSceneName, getScene, registerScene, registeredScenes } from './scenes/index'
