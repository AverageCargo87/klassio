import { ClientToolEvent, WebRtcClientToolEvent } from '../types/streaming';
import { ToolCallCompletedPayload, ToolCallFailedPayload, ToolCallStartedPayload } from '../types/toolCalling/ToolCallPayload';
import { WebRtcToolCallCompletedEvent, WebRtcToolCallFailedEvent, WebRtcToolCallStartedEvent } from '../types/streaming/WebRtcToolCallEvent';
import { ToolCallHandler } from '../types/toolCalling/ToolCallHandler';
import { InternalEventEmitter } from './InternalEventEmitter';
import { PublicEventEmitter } from './PublicEventEmitter';
export declare class ToolCallManager {
    private publicEventEmitter;
    private internalEventEmitter;
    private handlers;
    private pendingCalls;
    private failedCalls;
    private activeSessionId;
    constructor(publicEventEmitter: PublicEventEmitter, internalEventEmitter: InternalEventEmitter);
    setActiveSession(sessionId: string): void;
    clearSessionState(): void;
    clearPendingCalls(): void;
    clearFailedCalls(): void;
    registerHandler(toolName: string, handler: ToolCallHandler): () => void;
    processToolCallStartedEvent(toolCallEvent: WebRtcToolCallStartedEvent): Promise<void>;
    processToolCallCompletedEvent(toolCallEvent: WebRtcToolCallCompletedEvent): Promise<void>;
    processToolCallFailedEvent(toolCallEvent: WebRtcToolCallFailedEvent): Promise<void>;
    /**
     * Emits a tool result event so it can be sent back to the engine.
     * The StreamingClient listens for this event and sends the data channel message.
     */
    sendToolResult(result: {
        sessionId: string;
        toolCallId: string;
        userActionCorrelationId: string;
        timestampUserAction: string;
        result?: string;
        errorMessage?: string;
    }): void;
    /**
     * Converts a WebRtcClientToolEvent to a ClientToolEvent
     */
    static WebRTCClientToolEventToClientToolEvent(webRtcEvent: WebRtcClientToolEvent): ClientToolEvent;
    static WebRTCToolCallStartedEventToClientToolEvent(webRtcEvent: WebRtcToolCallStartedEvent): ClientToolEvent;
    WebRTCToolCallStartedEventToToolCallStartedPayload(webRtcEvent: WebRtcToolCallStartedEvent): ToolCallStartedPayload;
    webRTCToolCallCompletedEventToToolCallCompletedPayload(webRtcEvent: WebRtcToolCallCompletedEvent): ToolCallCompletedPayload;
    webRTCToolCallFailedEventToToolCallFailedPayload(webRtcEvent: WebRtcToolCallFailedEvent): ToolCallFailedPayload;
}
//# sourceMappingURL=ToolCallManager.d.ts.map