# Phase 10: Запись + транскрипт + контент-модерация + 152-ФЗ — Context

**Status:** SKELETON (PARTIAL BLOCK on Phase 6 voice + legal/storage decisions)
**Mode:** `--auto` (autonomous run; user AFK; full execution requires user decisions)

<domain>
Каждый урок при старте начинает запись composite-screen (board + avatar + trainer + voice transcript) и сохраняет на S3-compatible хранилище вне РФ. LLM-выходы модерируются. 152-ФЗ согласие собрано.
</domain>

<why_partial>
Blocking factors:
1. **152-ФЗ legal review** — required for production use. User must engage legal counsel OR self-research compliance requirements.
2. **S3 vs other storage decision (`$`-significant)** — Hetzner S3-compatible Object Storage (~€5.99/mo + per-GB), AWS S3 (out-of-RU), Backblaze B2, Cloudflare R2 (free egress). Cost watermark depends on lesson recording size (~50MB per 45-min composite recording → 15 lessons/мес = 750MB).
3. **STT decision** — 11labs ConvAI provides transcript, OR own STT (whisper.cpp on Hetzner, whisper API on OpenAI). Phase 6 establishes 11labs presence — likely use their transcript output.
4. **Recording technology** — MediaRecorder API client-side (composite via canvas.captureStream + audio merge) OR server-side compositing (Hetzner ffmpeg pipeline). Client-side simpler, server-side higher quality. Pick based on budget.
5. **Content moderation** — OpenAI Moderation API (free, included with API access) is default. Tone classifier для child-context (custom — needs labeled data). Phase 10 ships OpenAI Moderation, custom tone is v2.
</why_partial>

<draft_decisions>
- **D-01 — Storage: Cloudflare R2** (free egress, S3-compat). Eliminates RF egress costs.
- **D-02 — Recording: client-side MediaRecorder via canvas.captureStream**, audio captured from voice agent.
- **D-03 — Transcript: 11labs ConvAI built-in transcript** (Phase 6 dependency).
- **D-04 — Moderation: OpenAI Moderation API** (free) on every Pedagogical + Realtime LLM output.
- **D-05 — 152-ФЗ согласие через ACC-04 admin path** (preferred — родитель подписывает оффлайн, admin записывает факт). Альтернатива: in-ЛК checkbox (требует юридической проверки текста).
- **D-06 — Schema additions (Phase 10):** `recording.url`, `recording.size_bytes`, `recording.duration_sec`, `recording.transcript_url`, `consent_152fz.accepted_at`, `consent_152fz.method` (admin/ui).
- **D-07 — Alarm classifier** (success criterion #5) — separate phase or v2. Phase 10 just emits event + DB row; админ-канал alert = v2.
</draft_decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` § REC-01, REC-02
- `.planning/ROADMAP.md` § Phase 10 (7 success criteria)
- `.planning/MANUAL-ACTIONS.md` § Phase 10 (user decisions needed)
</canonical_refs>
