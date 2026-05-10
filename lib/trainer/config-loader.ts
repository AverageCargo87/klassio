// Server-side helper: load and validate a trainer config JSON file from public/trainer-configs/.
// 'server-only' pragma ensures this module is never bundled into the client bundle.
// Called from app/lesson/[id]/page.tsx (RSC) after ownership check.
// T-07-02-01: filename comes from lesson.htmlTrainerPath (DB column, admin-only write path).
// path.join with fixed prefix prevents simple traversal for well-formed filenames.
import 'server-only'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { trainerConfigSchema, type TrainerConfig } from './config-schema'

/**
 * Load and zod-validate a trainer config JSON file.
 *
 * @param filename - Basename of the JSON file, e.g. 'sample-column-addition.json'.
 *   Resolved to: <cwd>/public/trainer-configs/<filename>
 * @returns Validated TrainerConfig object.
 * @throws Error if the file cannot be read (ENOENT, permission errors).
 * @throws SyntaxError if the file contains invalid JSON.
 * @throws ZodError if the JSON does not satisfy trainerConfigSchema.
 *
 * Callers should `.catch(() => null)` if graceful degradation is desired.
 */
export async function loadTrainerConfig(filename: string): Promise<TrainerConfig> {
  const filePath = path.join(process.cwd(), 'public', 'trainer-configs', filename)
  const raw = await fs.readFile(filePath, 'utf8')
  const json = JSON.parse(raw)
  return trainerConfigSchema.parse(json)
}
