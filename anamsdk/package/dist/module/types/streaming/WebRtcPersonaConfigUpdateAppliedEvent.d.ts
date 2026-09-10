export interface WebRtcPersonaConfigUpdateAppliedEvent {
    session_id: string;
    changed_fields: Record<string, {
        before?: unknown;
        after?: unknown;
    }>;
}
//# sourceMappingURL=WebRtcPersonaConfigUpdateAppliedEvent.d.ts.map