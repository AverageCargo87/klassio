import { PublicEventEmitter, InternalEventEmitter } from '.';
export declare class ReasoningHistoryClient {
    private publicEventEmitter;
    private internalEventEmitter;
    private reasoning_messages;
    constructor(publicEventEmitter: PublicEventEmitter, internalEventEmitter: InternalEventEmitter);
    private webRtcTextMessageEventToReasoningStreamEvent;
    private processWebRtcReasoningTextMessageEvent;
}
//# sourceMappingURL=ReasoningHistoryClient.d.ts.map