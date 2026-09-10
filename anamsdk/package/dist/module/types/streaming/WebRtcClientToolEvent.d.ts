export interface WebRtcClientToolEvent {
    event_uid: string;
    session_id: string;
    event_name: string;
    event_data: Record<string, any>;
    timestamp: string;
    timestamp_user_action: string;
    user_action_correlation_id: string;
    used_outside_engine: boolean;
}
//# sourceMappingURL=WebRtcClientToolEvent.d.ts.map