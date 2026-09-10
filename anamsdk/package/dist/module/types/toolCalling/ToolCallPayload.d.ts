export interface ToolCallStartedPayload {
    eventUid: string;
    sessionId: string;
    toolCallId: string;
    toolName: string;
    toolType: string;
    toolSubtype?: string;
    arguments: Record<string, any>;
    timestamp: string;
    timestampUserAction: string;
    userActionCorrelationId: string;
}
export interface ToolCallCompletedPayload {
    eventUid: string;
    sessionId: string;
    toolCallId: string;
    toolName: string;
    toolType: string;
    toolSubtype?: string;
    result: any;
    executionTime: number;
    timestamp: string;
    documentsAccessed?: string[];
    timestampUserAction: string;
    userActionCorrelationId: string;
}
export interface ToolCallResultReceivedPayload {
    sessionId: string;
    toolCallId: string;
    result?: string;
    errorMessage?: string;
    userActionCorrelationId: string;
    timestampUserAction: string;
}
export interface ToolCallFailedPayload {
    eventUid: string;
    sessionId: string;
    toolCallId: string;
    toolName: string;
    toolType: string;
    toolSubtype?: string;
    errorMessage: string;
    executionTime: number;
    timestamp: string;
    timestampUserAction: string;
    userActionCorrelationId: string;
}
//# sourceMappingURL=ToolCallPayload.d.ts.map