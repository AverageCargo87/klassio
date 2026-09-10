import { InternalEventEmitter, PublicEventEmitter } from '.';
import { ClientConnectionMilestoneRecorder } from '../lib/ConnectionMilestones';
import { SignallingClientOptions, ApiGatewayConfig, AgentAudioInputPayload } from '../types';
import { TalkMessageStreamPayload } from '../types/signalling/TalkMessageStreamPayload';
export declare class SignallingClient {
    private publicEventEmitter;
    private internalEventEmitter;
    private url;
    private sessionId;
    private heartbeatIntervalSeconds;
    private maxWsReconnectionAttempts;
    private stopSignal;
    private sendingBuffer;
    private wsConnectionAttempts;
    private socket;
    private permanentlyClosed;
    private iceRestartReconnectInProgress;
    private heartBeatIntervalRef;
    private reconnectTimer;
    private stableConnectionTimer;
    private apiGatewayConfig;
    private connectionMilestones;
    constructor(sessionId: string, options: SignallingClientOptions, publicEventEmitter: PublicEventEmitter, internalEventEmitter: InternalEventEmitter, apiGatewayConfig?: ApiGatewayConfig, connectionMilestones?: ClientConnectionMilestoneRecorder);
    stop(): void;
    connect(): WebSocket;
    /**
     * Force a fresh signalling socket for an ICE restart. A network switch can
     * leave the existing socket half-open (readyState stays OPEN with no 'close'
     * event), so a restart offer sent on it is silently dropped. Detach the stale
     * socket's handlers so its eventual close does not drive the reconnect backoff,
     * drop it, and open a new connection. While the new network path is still dead,
     * use an ICE-restart-specific retry budget so signalling does not terminally
     * close before StreamingClient's websocket-open wait can time out and retry.
     */
    reconnectForIceRestart(): void;
    /**
     * Ends the ICE-restart reconnect episode: subsequent closes use the default
     * retry budget again. Called by StreamingClient when the restart succeeds,
     * is cancelled, or exhausts its attempts.
     */
    endIceRestartReconnect(): void;
    isConnected(): boolean;
    isPermanentlyClosed(): boolean;
    sendOffer(localDescription: RTCSessionDescription): Promise<void>;
    sendIceCandidate(candidate: RTCIceCandidate): Promise<void>;
    private sendSignalMessage;
    sendTalkMessage(payload: TalkMessageStreamPayload): Promise<void>;
    sendAgentAudioInput(payload: AgentAudioInputPayload): void;
    sendAgentAudioInputEnd(): void;
    private closeSocket;
    private onOpen;
    private clearReconnectTimer;
    private clearStableConnectionTimer;
    private clearHeartbeatInterval;
    private scheduleStableConnectionReset;
    private onClose;
    private getMaxReconnectionAttempts;
    private shouldRetryCloseEvent;
    private isApiGatewayBackendClose;
    private onError;
    private flushSendingBuffer;
    private onMessage;
    private startSendingHeartBeats;
}
//# sourceMappingURL=SignallingClient.d.ts.map