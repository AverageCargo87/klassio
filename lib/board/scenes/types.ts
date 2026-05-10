import type { DrawToolName } from '@/lib/board/tools'

// A single primitive call emitted by a scene generator.
// 'finish' is excluded — scenes do not call finish; the agent loop does.
export type PrimitiveName = Exclude<DrawToolName, 'finish'>

export interface PrimitiveCall {
  name: PrimitiveName
  input: Record<string, unknown>
}

// All 15 scene names (D-01)
export type SceneName =
  | 'explain_column_addition'
  | 'explain_column_subtraction'
  | 'explain_multiplication_grid'
  | 'explain_long_division'
  | 'explain_fraction_addition'
  | 'explain_fraction_subtraction'
  | 'explain_fraction_comparison'
  | 'explain_fraction_simplification'
  | 'explain_decimal_addition'
  | 'explain_decimal_multiplication'
  | 'explain_percent_calculation'
  | 'explain_rectangle_area'
  | 'explain_rectangle_perimeter'
  | 'explain_simple_equation'
  | 'explain_arithmetic_mean'

// Each scene is a generator function that yields PrimitiveCalls.
// args is typed as unknown — each scene file does its own runtime validation.
export type SceneGenerator = (args: unknown) => Generator<PrimitiveCall>
