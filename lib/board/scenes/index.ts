import type { SceneName, SceneGenerator } from './types'

// Registry is populated by each scene file calling registerScene().
// This avoids circular imports: types.ts has no scene imports; index.ts has no scene imports at module level.
const _registry: Partial<Record<SceneName, SceneGenerator>> = {}

export function registerScene(name: SceneName, fn: SceneGenerator): void {
  _registry[name] = fn
}

export function isSceneName(name: string): name is SceneName {
  return name in _registry
}

export function getScene(name: SceneName): SceneGenerator | undefined {
  return _registry[name]
}

// Exported for testing — returns array of registered scene names
export function registeredScenes(): SceneName[] {
  return Object.keys(_registry) as SceneName[]
}
