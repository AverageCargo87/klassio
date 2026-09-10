export interface WebRtcTextMessageEvent {
    message_id: string;
    content_index: number;
    content: string;
    role: string;
    end_of_speech: boolean;
    interrupted: boolean;
    cue_tag?: string;
    utterance_id?: string;
    user_action_correlation_id?: string;
    correlationId?: string;
}
//# sourceMappingURL=WebRtcTextMessageEvent.d.ts.map