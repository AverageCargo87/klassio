import { ClientConnectionMilestoneRecorder } from '../lib/ConnectionMilestones';
import { InternalEventEmitter, PublicEventEmitter } from '../modules';
import { AgentAudioInputConfig, InputAudioState, StreamingClientOptions } from '../types';
import { AgentAudioInputStream } from '../types/AgentAudioInputStream';
import { TalkMessageStream } from '../types/TalkMessageStream';
import { ToolCallManager } from './ToolCallManager';
export declare class StreamingClient {
    private publicEventEmitter;
    private internalEventEmitter;
    private signallingClient;
    private engineApiRestClient;
    private iceServers;
    private iceTransportPolicy;
    private rtcConfiguration;
    private apiGatewayConfig;
    private peerConnection;
    private connectionEstablishedEmitted;
    private iceRestartInProgress;
    private iceRestartAttempts;
    private iceRestartAwaitedAnswer;
    private iceRestartEpisodeStartMs;
    private iceRestartEpisodeTrigger;
    private iceRestartStopped;
    private iceDisconnectedGraceTimer;
    private iceRestartWatchdogTimer;
    private pendingWsOpenListener;
    private pendingWsOpenTimeout;
    private pendingWsOpenReject;
    private connectionReceivedAnswer;
    private remoteIceCandidateBuffer;
    private iceRestartCandidateBuffer;
    private inputAudioStream;
    private dataChannel;
    private videoElement;
    private videoStream;
    private audioStream;
    private inputAudioState;
    private audioDeviceId;
    private disableInputAudio;
    private successMetricPoller;
    private successMetricFired;
    private showPeerConnectionStatsReport;
    private peerConnectionStatsReportOutputFormat;
    private statsCollectionInterval;
    private agentAudioInputStream;
    private toolCallManager;
    private connectionMilestones;
    private firstLocalIceCandidateSent;
    private firstRemoteIceCandidateReceived;
    private firstRemoteIceCandidateApplied;
    private connectionEstablishedMilestoneRecorded;
    constructor(sessionId: string, options: StreamingClientOptions, publicEventEmitter: PublicEventEmitter, internalEventEmitter: InternalEventEmitter, toolCallManager: ToolCallManager, connectionMilestones?: ClientConnectionMilestoneRecorder);
    private onInputAudioStateChange;
    private muteAllAudioTracks;
    private unmuteAllAudioTracks;
    private startStatsCollection;
    private sendClientSideMetrics;
    private recordSessionSuccess;
    private startSuccessMetricPolling;
    muteInputAudio(): InputAudioState;
    unmuteInputAudio(): InputAudioState;
    getInputAudioState(): InputAudioState;
    getPeerConnection(): RTCPeerConnection | null;
    changeAudioInputDevice(deviceId: string): Promise<void>;
    getInputAudioStream(): MediaStream | null;
    getVideoStream(): MediaStream | null;
    getAudioStream(): MediaStream | null;
    private onToolCallResultReceived;
    sendDataMessage(message: string): boolean;
    setMediaStreamTargetById(videoElementId: string): void;
    startConnection(): void;
    private resetAttemptScopedMilestoneState;
    stopConnection(): Promise<void>;
    sendTalkCommand(content: string): Promise<void>;
    startTalkMessageStream(correlationId?: string): TalkMessageStream;
    createAgentAudioInputStream(config: AgentAudioInputConfig): AgentAudioInputStream;
    getAgentAudioInputStream(): AgentAudioInputStream | null;
    private initPeerConnection;
    private onSignalMessage;
    private onSignallingClientConnected;
    private flushRemoteIceCandidateBuffer;
    /**
     * Add a single remote ICE candidate to the peer connection.
     * Each candidate is added independently: a rejection on one candidate is
     * logged and swallowed so it cannot abort the flush loop (dropping the
     * remaining buffered candidates) or surface as an unhandled rejection from
     * the ANSWER handler. The "first applied" milestone is only recorded after a
     * genuine, successful add.
     */
    private addRemoteIceCandidate;
    private recordFirstRemoteIceCandidateApplied;
    /**
     * ICE Candidate Trickle
     * As each ICE candidate is gathered from the STUN server it is sent to the
     * webRTC server immediately in an effort to reduce time to connection.
     */
    private onIceCandidate;
    private onIceConnectionStateChange;
    private clearIceDisconnectedGraceTimer;
    private clearIceRestartWatchdog;
    private sendIceRestartMetric;
    private isAwaitingRestartAnswer;
    private onAnswerAccepted;
    private clearPendingWsOpenWait;
    private cancelIceRestart;
    private flushIceRestartCandidateBuffer;
    private scheduleIceRestartAfterGrace;
    /**
     * Resolve once the signalling WebSocket is open (it auto-reconnects on close),
     * or reject if it is terminally closed / times out. Restart offers must never
     * be sent on a dead socket. Timeout + listener are stored so shutdown can clear
     * them (see clearPendingWsOpenWait).
     */
    private ensureSignallingConnected;
    /**
     * Automatic ICE restart. Mints a new offer with fresh ICE credentials and
     * sends it over the existing channel. Bounded retries via a watchdog; on
     * exhaustion or terminal signalling, falls back to the WebRTC-failure path.
     */
    private restartIce;
    private onIceRestartWatchdog;
    private onConnectionStateChange;
    private handleWebrtcFailure;
    private onTrackEventHandler;
    /**
     * Set up the data channels for sending and receiving messages
     */
    private setupDataChannels;
    /**
     * Request microphone permission asynchronously without blocking connection
     */
    private requestMicrophonePermissionAsync;
    /**
     * Set up audio track and add it to the peer connection using replaceTrack
     */
    private setupAudioTrack;
    private initPeerConnectionAndSendOffer;
    private shutdown;
}
//# sourceMappingURL=StreamingClient.d.ts.map