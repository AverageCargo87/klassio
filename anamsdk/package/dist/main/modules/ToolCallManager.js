"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolCallManager = void 0;
const types_1 = require("../types");
const calculateExecutionTime = (startTimestamp, endTimestamp) => {
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
        return 0;
    }
    const executionTime = endTimestamp - startTimestamp;
    return executionTime > 0 ? executionTime : 0;
};
class ToolCallManager {
    constructor(publicEventEmitter, internalEventEmitter) {
        this.handlers = Object.create(null);
        this.pendingCalls = Object.create(null);
        this.failedCalls = Object.create(null);
        this.activeSessionId = null;
        this.publicEventEmitter = publicEventEmitter;
        this.internalEventEmitter = internalEventEmitter;
    }
    setActiveSession(sessionId) {
        this.activeSessionId = sessionId;
        this.clearPendingCalls();
        this.clearFailedCalls();
    }
    clearSessionState() {
        this.activeSessionId = null;
        this.clearPendingCalls();
        this.clearFailedCalls();
    }
    clearPendingCalls() {
        this.pendingCalls = Object.create(null);
    }
    clearFailedCalls() {
        this.failedCalls = Object.create(null);
    }
    registerHandler(toolName, handler) {
        this.handlers[toolName] = handler;
        return () => {
            delete this.handlers[toolName];
        };
    }
    processToolCallStartedEvent(toolCallEvent) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.activeSessionId !== toolCallEvent.session_id) {
                return;
            }
            const { tool_name, timestamp } = toolCallEvent;
            const payload = this.WebRTCToolCallStartedEventToToolCallStartedPayload(toolCallEvent);
            const parsedTimestamp = new Date(timestamp);
            // Store in pending calls before invoking handlers
            this.pendingCalls[toolCallEvent.tool_call_id] = {
                payload: payload,
                timestamp: parsedTimestamp.getTime(),
            };
            if (!(tool_name in this.handlers)) {
                return;
            }
            const handler = this.handlers[tool_name];
            if (!handler.onStart) {
                return;
            }
            try {
                const result = yield handler.onStart(payload);
                if (toolCallEvent.tool_type === 'client') {
                    this.sendToolResult({
                        sessionId: toolCallEvent.session_id,
                        toolCallId: toolCallEvent.tool_call_id,
                        userActionCorrelationId: toolCallEvent.user_action_correlation_id,
                        timestampUserAction: toolCallEvent.timestamp_user_action,
                        result: result !== null && result !== void 0 ? result : undefined,
                        errorMessage: undefined,
                    });
                    yield this.processToolCallCompletedEvent(Object.assign(Object.assign({}, toolCallEvent), { result: result, timestamp: new Date().toISOString() }));
                    return;
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (toolCallEvent.tool_type === 'client') {
                    this.sendToolResult({
                        sessionId: toolCallEvent.session_id,
                        toolCallId: toolCallEvent.tool_call_id,
                        userActionCorrelationId: toolCallEvent.user_action_correlation_id,
                        timestampUserAction: toolCallEvent.timestamp_user_action,
                        result: undefined,
                        errorMessage: `Error in handler: ${errorMessage}`,
                    });
                }
                yield this.processToolCallFailedEvent(Object.assign(Object.assign({}, toolCallEvent), { error_message: `Error in onStart handler: ${errorMessage}`, timestamp: new Date().toISOString() }));
                return;
            }
        });
    }
    processToolCallCompletedEvent(toolCallEvent) {
        return __awaiter(this, void 0, void 0, function* () {
            const { tool_name, tool_call_id } = toolCallEvent;
            if (this.activeSessionId !== toolCallEvent.session_id) {
                return;
            }
            if (tool_call_id in this.failedCalls) {
                // If this call was previously marked as failed, do not process it as completed
                delete this.failedCalls[tool_call_id]; // Clean up failed call record
                return;
            }
            const payload = this.webRTCToolCallCompletedEventToToolCallCompletedPayload(toolCallEvent);
            if (tool_call_id in this.pendingCalls) {
                // Clean up pending call
                delete this.pendingCalls[tool_call_id];
            }
            if (!(tool_name in this.handlers)) {
                return;
            }
            const handler = this.handlers[tool_name];
            if (!handler.onComplete) {
                return;
            }
            if (toolCallEvent.tool_type === 'client') {
                this.publicEventEmitter.emit(types_1.AnamEvent.TOOL_CALL_COMPLETED, payload);
            }
            try {
                yield handler.onComplete(payload);
            }
            catch (error) {
                console.error(`Error in onComplete handler for tool ${tool_name}:`, error);
                return;
            }
        });
    }
    processToolCallFailedEvent(toolCallEvent) {
        return __awaiter(this, void 0, void 0, function* () {
            const { tool_name, tool_call_id } = toolCallEvent;
            if (this.activeSessionId !== toolCallEvent.session_id) {
                return;
            }
            const payload = this.webRTCToolCallFailedEventToToolCallFailedPayload(toolCallEvent);
            // Mark the call as failed
            this.failedCalls[tool_call_id] = payload;
            if (tool_call_id in this.pendingCalls) {
                delete this.pendingCalls[tool_call_id];
            }
            if (!(tool_name in this.handlers)) {
                return;
            }
            const handler = this.handlers[tool_name];
            if (!handler.onFail) {
                return;
            }
            if (toolCallEvent.tool_type === 'client') {
                this.publicEventEmitter.emit(types_1.AnamEvent.TOOL_CALL_FAILED, payload);
            }
            try {
                yield handler.onFail(payload);
            }
            catch (error) {
                console.error(`Error in onFail handler for tool ${tool_name}:`, error);
                return;
            }
        });
    }
    /**
     * Emits a tool result event so it can be sent back to the engine.
     * The StreamingClient listens for this event and sends the data channel message.
     */
    sendToolResult(result) {
        const payload = {
            sessionId: result.sessionId,
            toolCallId: result.toolCallId,
            result: result.result,
            errorMessage: result.errorMessage,
            userActionCorrelationId: result.userActionCorrelationId,
            timestampUserAction: result.timestampUserAction,
        };
        this.internalEventEmitter.emit(types_1.InternalEvent.TOOL_CALL_RESULT_READY, payload);
    }
    /**
     * Converts a WebRtcClientToolEvent to a ClientToolEvent
     */
    static WebRTCClientToolEventToClientToolEvent(webRtcEvent) {
        return {
            eventUid: webRtcEvent.event_uid,
            sessionId: webRtcEvent.session_id,
            eventName: webRtcEvent.event_name,
            eventData: webRtcEvent.event_data,
            timestamp: webRtcEvent.timestamp,
            timestampUserAction: webRtcEvent.timestamp_user_action,
            userActionCorrelationId: webRtcEvent.user_action_correlation_id,
        };
    }
    static WebRTCToolCallStartedEventToClientToolEvent(webRtcEvent) {
        return {
            eventUid: webRtcEvent.event_uid,
            sessionId: webRtcEvent.session_id,
            eventName: webRtcEvent.tool_name,
            eventData: webRtcEvent.arguments,
            timestamp: webRtcEvent.timestamp,
            timestampUserAction: webRtcEvent.timestamp_user_action,
            userActionCorrelationId: webRtcEvent.user_action_correlation_id,
        };
    }
    WebRTCToolCallStartedEventToToolCallStartedPayload(webRtcEvent) {
        return {
            eventUid: webRtcEvent.event_uid,
            sessionId: webRtcEvent.session_id,
            toolCallId: webRtcEvent.tool_call_id,
            toolName: webRtcEvent.tool_name,
            toolType: webRtcEvent.tool_type,
            toolSubtype: webRtcEvent.tool_subtype,
            arguments: webRtcEvent.arguments,
            timestamp: webRtcEvent.timestamp,
            timestampUserAction: webRtcEvent.timestamp_user_action,
            userActionCorrelationId: webRtcEvent.user_action_correlation_id,
        };
    }
    webRTCToolCallCompletedEventToToolCallCompletedPayload(webRtcEvent) {
        const parsedTimestamp = new Date(webRtcEvent.timestamp);
        const pendingCall = this.pendingCalls[webRtcEvent.tool_call_id];
        const executionTime = pendingCall
            ? calculateExecutionTime(pendingCall.timestamp, parsedTimestamp.getTime())
            : 0;
        return {
            eventUid: webRtcEvent.event_uid,
            sessionId: webRtcEvent.session_id,
            toolCallId: webRtcEvent.tool_call_id,
            toolName: webRtcEvent.tool_name,
            toolType: webRtcEvent.tool_type,
            toolSubtype: webRtcEvent.tool_subtype,
            result: webRtcEvent.result,
            executionTime: executionTime > 0 ? executionTime : 0,
            timestamp: webRtcEvent.timestamp,
            documentsAccessed: webRtcEvent.documents_accessed, // Include accessed files if present
            timestampUserAction: webRtcEvent.timestamp_user_action,
            userActionCorrelationId: webRtcEvent.user_action_correlation_id,
        };
    }
    webRTCToolCallFailedEventToToolCallFailedPayload(webRtcEvent) {
        const parsedTimestamp = new Date(webRtcEvent.timestamp);
        const pendingCall = this.pendingCalls[webRtcEvent.tool_call_id];
        const executionTime = pendingCall
            ? calculateExecutionTime(pendingCall.timestamp, parsedTimestamp.getTime())
            : 0;
        return {
            eventUid: webRtcEvent.event_uid,
            sessionId: webRtcEvent.session_id,
            toolCallId: webRtcEvent.tool_call_id,
            toolName: webRtcEvent.tool_name,
            toolType: webRtcEvent.tool_type,
            toolSubtype: webRtcEvent.tool_subtype,
            errorMessage: webRtcEvent.error_message,
            executionTime: executionTime > 0 ? executionTime : 0,
            timestamp: webRtcEvent.timestamp,
            timestampUserAction: webRtcEvent.timestamp_user_action,
            userActionCorrelationId: webRtcEvent.user_action_correlation_id,
        };
    }
}
exports.ToolCallManager = ToolCallManager;
//# sourceMappingURL=ToolCallManager.js.map