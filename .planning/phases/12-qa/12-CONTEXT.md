# Phase 12: End-to-end QA + first 45-min lesson dry-run — Context

**Status:** SKELETON (BLOCKED — final integration test, requires Phases 1-11 complete)
**Mode:** `--auto` (autonomous run)

<domain>
v1 success metric выполнен: один полный 45-60 минутный урок проходит end-to-end без вмешательства разработчика. Тестовый ребёнок (или сам разработчик играя за ребёнка) проходит реальный урок из РФ без VPN.
</domain>

<why_blocked>
Phase 12 = full integration QA. Все prior phases must be live + functional:
- Phase 1: ЛК + auth (✅ implementation done; deploy DEFERRED)
- Phase 2: schedule + admin path (✅)
- Phase 3: lesson page shell (✅)
- Phase 4: board port (✅ implementation; deploy DEFERRED)
- Phase 5: scenes (✅)
- Phase 6: voice (BLOCKED — user manual)
- Phase 7: trainer (✅ shell; voice reactions deferred)
- Phase 8: two-tier LLM (BLOCKED on Phase 6)
- Phase 9: avatar (✅ shell; voice triggers deferred)
- Phase 10: recording (BLOCKED on Phase 6 + storage decision)
- Phase 11: sync (BLOCKED on Phase 6 + Phase 8)

Phase 12 не может быть выполнена пока Phase 6 не unblock'нется.
</why_blocked>

<plan_when_unblocked>
After all dependencies green:
1. **Prepare real lesson content** — 45-60 min математики 5 класса, минимум 3 BRD-02 scenes, минимум 5 trainer tasks. Use admin CLI (ACC-04) для setup.
2. **Run lesson** — child opens link without VPN from RU → лично проходит урок (или dev acts as child).
3. **Recording verification** — Phase 10 запись available после lesson + transcript playable + клик в transcript jumps to timestamp.
4. **Manual QA checklist:**
   - Voice + drawing + trainer highlight синхронны (INV-02)
   - Bot реагирует на wrong answers (Phase 8 proactive triggers)
   - Avatar emotion changes по контексту
   - 152-ФЗ согласие зарегано
   - Cost per lesson измерен (target <200 ₽ per project COSTS.md)
5. **Document findings** в `.planning/phases/12-qa/12-VERIFICATION.md` + final v1 release notes.
6. **v1 ship decision** based on:
   - Все must-haves work
   - Cost watermark hit
   - No critical bugs
   - User acceptance test passed
</plan_when_unblocked>

<canonical_refs>
- `.planning/PROJECT.md` § v1 success metric
- `.planning/REQUIREMENTS.md` (all 21 requirements should validate at this point)
- `.planning/ROADMAP.md` § Phase 12 (success criteria)
- `.planning/COSTS.md` (cost per lesson watermark — measure here)
- `.planning/MANUAL-ACTIONS.md` (status of every блокирующего user action)
</canonical_refs>
