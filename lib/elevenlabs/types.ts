// SDK-aligned named string-literal unions for the @elevenlabs/react SDK callbacks
// (per RESEARCH § Pattern 1 and CONTEXT § D-06 / D-07).
//
// Why a local barrel:
// - VoicePanel (06-02) imports from a stable internal path so we can swap implementations
//   later without touching call sites.
// - SDK 1.6.0 exports the same names, but keeping our boundary local makes the trust
//   boundary explicit (the SDK lives behind this file; nothing else imports from
//   '@elevenlabs/react' transitively in our codebase outside components/panels/).
//
// VoiceErrorKind is OUR domain wrapper around the 5 distinct error UX paths that
// VoicePanel (06-02) renders Russian messages for — see RESEARCH § Pitfall 1
// for the mapping (NotAllowedError → mic_denied, etc.).

// SDK conversation modes — the agent is either speaking to user or listening to user.
// Re-export shape — not a literal re-export to keep the SDK boundary local.
export type ConversationMode = 'speaking' | 'listening'

// SDK conversation lifecycle. Avatar state machine in Phase 9 maps these to
// emoji states (`idle` 🙂, `listening` 👂, `speaking` 🗣️).
export type ConversationStatus = 'connected' | 'connecting' | 'disconnected' | 'disconnecting'

// Internal domain union for mic-permission + SDK error UX (RESEARCH § Pitfall 1).
// VoicePanel switches on this kind to render the correct Russian message in 06-02.
export type VoiceErrorKind =
  | 'mic_denied' // NotAllowedError from getUserMedia
  | 'mic_not_found' // NotFoundError
  | 'mic_busy' // NotReadableError
  | 'signed_url_fetch' // POST /api/voice/signed-url failed
  | 'sdk' // SDK onError
