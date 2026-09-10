"use strict";
/**
 * Director Notes guide a Cara 4 avatar's performance for a session — a
 * baseline style plus how expressively it is played. They are forwarded
 * unchanged to session-token creation and are only applied on Cara 4 avatars;
 * on older models the server ignores them and the session proceeds without
 * them.
 *
 * `presetStyle` and `customStylePrompt` are mutually exclusive — the exclusive
 * union below enforces that at the type level, so providing both is a compile
 * error. The server remains the source of truth for validation (including
 * model compatibility).
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=DirectorNotes.js.map