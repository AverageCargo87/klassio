export interface WebRtcToolCallEventBase {
    event_uid: string;
    session_id: string;
    tool_call_id: string;
    tool_name: string;
    tool_type: string;
    tool_subtype?: string;
    arguments: Record<string, any>;
    timestamp: string;
    timestamp_user_action: string;
    user_action_correlation_id: string;
    used_outside_engine: boolean;
}
export interface WebRtcToolCallStartedEvent extends WebRtcToolCallEventBase {
}
export interface WebRtcToolCallCompletedEvent extends WebRtcToolCallEventBase {
    result: any;
    documents_accessed?: string[];
}
export interface WebRtcToolCallFailedEvent extends WebRtcToolCallEventBase {
    error_message: string;
}
//# sourceMappingURL=WebRtcToolCallEvent.d.ts.map