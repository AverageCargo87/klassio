var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ClientMetricMeasurement, createRTCStatsReport, sendClientMetric, } from '../lib/ClientMetrics';
import { EngineApiRestClient, SignallingClient, } from '../modules';
import { AnamEvent, AudioPermissionState, ConnectionClosedCode, DataChannelMessage, InternalEvent, SignalMessageAction, } from '../types';
import { AgentAudioInputStream } from '../types/AgentAudioInputStream';
import { TalkMessageStream } from '../types/TalkMessageStream';
import { ToolCallManager } from './ToolCallManager';
const SUCCESS_METRIC_POLLING_TIMEOUT_MS = 15000; // After this time we will stop polling for the first frame and consider the session a failure.
const STATS_COLLECTION_INTERVAL_MS = 5000;
const ICE_CANDIDATE_POOL_SIZE = 2; // Optimisation to speed up connection time
const MAX_ICE_RESTART_ATTEMPTS = 3;
const ICE_DISCONNECTED_GRACE_MS = 2000;
const ICE_RESTART_WATCHDOG_MS = 3000;
const ENSURE_WS_OPEN_TIMEOUT_MS = 5000;
export class StreamingClient {
    constructor(sessionId, options, publicEventEmitter, internalEventEmitter, toolCallManager, connectionMilestones) {
        var _a, _b, _c, _d;
        this.peerConnection = null;
        this.connectionEstablishedEmitted = false;
        this.iceRestartInProgress = false;
        this.iceRestartAttempts = 0;
        this.iceRestartAwaitedAnswer = false;
        // Restart-episode telemetry (see sendIceRestartMetric). null = no episode.
        this.iceRestartEpisodeStartMs = null;
        this.iceRestartEpisodeTrigger = null;
        this.iceRestartStopped = false; // set on shutdown; halts all restart activity
        this.iceDisconnectedGraceTimer = null;
        this.iceRestartWatchdogTimer = null;
        this.pendingWsOpenListener = null;
        this.pendingWsOpenTimeout = null;
        this.pendingWsOpenReject = null;
        this.connectionReceivedAnswer = false;
        this.remoteIceCandidateBuffer = [];
        // While a re-offer is being minted and sent, local candidates are buffered here
        // so they reach the server AFTER the restart offer (which carries the new ICE
        // credentials); otherwise the engine adds them against the old generation and
        // drops them. null = not buffering (normal path).
        this.iceRestartCandidateBuffer = null;
        this.inputAudioStream = null;
        this.dataChannel = null;
        this.videoElement = null;
        this.videoStream = null;
        this.audioStream = null;
        this.inputAudioState = {
            isMuted: false,
            permissionState: AudioPermissionState.NOT_REQUESTED,
        };
        this.successMetricPoller = null;
        this.successMetricFired = false;
        this.showPeerConnectionStatsReport = false;
        this.peerConnectionStatsReportOutputFormat = 'console';
        this.statsCollectionInterval = null;
        this.agentAudioInputStream = null;
        this.firstLocalIceCandidateSent = false;
        this.firstRemoteIceCandidateReceived = false;
        this.firstRemoteIceCandidateApplied = false;
        this.connectionEstablishedMilestoneRecorded = false;
        this.publicEventEmitter = publicEventEmitter;
        this.internalEventEmitter = internalEventEmitter;
        this.toolCallManager = toolCallManager;
        this.connectionMilestones = connectionMilestones;
        this.apiGatewayConfig = options.apiGateway;
        // initialize input audio state
        const { inputAudio } = options;
        this.inputAudioState = inputAudio.inputAudioState;
        if (options.inputAudio.userProvidedMediaStream) {
            this.inputAudioStream = options.inputAudio.userProvidedMediaStream;
        }
        this.disableInputAudio = options.inputAudio.disableInputAudio === true;
        // register event handlers
        this.internalEventEmitter.addListener(InternalEvent.WEB_SOCKET_OPEN, this.onSignallingClientConnected.bind(this));
        this.internalEventEmitter.addListener(InternalEvent.SIGNAL_MESSAGE_RECEIVED, this.onSignalMessage.bind(this));
        this.internalEventEmitter.addListener(InternalEvent.WEBRTC_TOOL_CALL_STARTED_EVENT_RECEIVED, this.toolCallManager.processToolCallStartedEvent.bind(this.toolCallManager));
        this.internalEventEmitter.addListener(InternalEvent.WEBRTC_TOOL_CALL_COMPLETED_EVENT_RECEIVED, this.toolCallManager.processToolCallCompletedEvent.bind(this.toolCallManager));
        this.internalEventEmitter.addListener(InternalEvent.WEBRTC_TOOL_CALL_FAILED_EVENT_RECEIVED, this.toolCallManager.processToolCallFailedEvent.bind(this.toolCallManager));
        this.internalEventEmitter.addListener(InternalEvent.TOOL_CALL_RESULT_READY, this.onToolCallResultReceived.bind(this));
        // set ice servers
        this.iceServers = options.iceServers;
        this.iceTransportPolicy = options.iceTransportPolicy;
        this.rtcConfiguration = options.rtcConfiguration;
        // initialize signalling client
        this.signallingClient = new SignallingClient(sessionId, options.signalling, this.publicEventEmitter, this.internalEventEmitter, this.apiGatewayConfig, this.connectionMilestones);
        // initialize engine API client
        this.engineApiRestClient = new EngineApiRestClient(options.engine.baseUrl, sessionId, this.apiGatewayConfig);
        this.audioDeviceId = options.inputAudio.audioDeviceId;
        this.showPeerConnectionStatsReport =
            (_b = (_a = options.metrics) === null || _a === void 0 ? void 0 : _a.showPeerConnectionStatsReport) !== null && _b !== void 0 ? _b : false;
        this.peerConnectionStatsReportOutputFormat =
            (_d = (_c = options.metrics) === null || _c === void 0 ? void 0 : _c.peerConnectionStatsReportOutputFormat) !== null && _d !== void 0 ? _d : 'console';
    }
    onInputAudioStateChange(oldState, newState) {
        // changed microphone mute state
        if (oldState.isMuted !== newState.isMuted) {
            if (newState.isMuted) {
                this.muteAllAudioTracks();
            }
            else {
                this.unmuteAllAudioTracks();
            }
        }
    }
    muteAllAudioTracks() {
        var _a;
        (_a = this.inputAudioStream) === null || _a === void 0 ? void 0 : _a.getAudioTracks().forEach((track) => {
            track.enabled = false;
        });
    }
    unmuteAllAudioTracks() {
        var _a;
        (_a = this.inputAudioStream) === null || _a === void 0 ? void 0 : _a.getAudioTracks().forEach((track) => {
            track.enabled = true;
        });
    }
    startStatsCollection() {
        if (this.statsCollectionInterval) {
            return;
        }
        // Send stats every STATS_COLLECTION_INTERVAL_MS seconds
        this.statsCollectionInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            if (!this.peerConnection ||
                !this.dataChannel ||
                this.dataChannel.readyState !== 'open') {
                return;
            }
            try {
                const stats = yield this.peerConnection.getStats();
                this.sendClientSideMetrics(stats);
            }
            catch (error) {
                console.error('Failed to collect and send stats:', error);
            }
        }), STATS_COLLECTION_INTERVAL_MS);
    }
    sendClientSideMetrics(stats) {
        stats.forEach((report) => {
            // Process inbound-rtp stats for both video and audio
            if (report.type === 'inbound-rtp') {
                const metrics = {
                    message_type: 'remote_rtp_stats',
                    data: report,
                };
                // Send the metrics via data channel
                if (this.dataChannel && this.dataChannel.readyState === 'open') {
                    this.dataChannel.send(JSON.stringify(metrics));
                }
            }
        });
    }
    recordSessionSuccess(detectionMethod) {
        var _a, _b;
        if (this.successMetricFired) {
            return;
        }
        this.successMetricFired = true;
        (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('first_video_frame', {
            detectionMethod,
        });
        (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.recordSessionSuccess({ detectionMethod });
        sendClientMetric(ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_SESSION_SUCCESS, '1', { detectionMethod });
    }
    startSuccessMetricPolling() {
        if (this.successMetricPoller || this.successMetricFired) {
            return;
        }
        const timeoutId = setTimeout(() => {
            var _a, _b;
            if (this.successMetricPoller) {
                (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('first_video_frame_timeout', {
                    timeoutMs: SUCCESS_METRIC_POLLING_TIMEOUT_MS,
                });
                (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.publishFailure({
                    failureStage: 'first_video_frame',
                    timeoutMs: SUCCESS_METRIC_POLLING_TIMEOUT_MS,
                });
                console.warn('No video frames received, there is a problem with the connection.');
                clearInterval(this.successMetricPoller);
                this.successMetricPoller = null;
            }
        }, SUCCESS_METRIC_POLLING_TIMEOUT_MS);
        this.successMetricPoller = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            if (!this.peerConnection || this.successMetricFired) {
                if (this.successMetricPoller) {
                    clearInterval(this.successMetricPoller);
                }
                clearTimeout(timeoutId);
                return;
            }
            try {
                const stats = yield this.peerConnection.getStats();
                let videoDetected = false;
                let detectionMethod = null;
                stats.forEach((report) => {
                    // Find the report for inbound video
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        // Method 1: Try framesDecoded (most reliable when available)
                        if (report.framesDecoded !== undefined &&
                            report.framesDecoded > 0) {
                            videoDetected = true;
                            detectionMethod = 'framesDecoded';
                        }
                        else if (report.framesReceived !== undefined &&
                            report.framesReceived > 0) {
                            videoDetected = true;
                            detectionMethod = 'framesReceived';
                        }
                        else if (report.bytesReceived > 0 &&
                            report.packetsReceived > 0 &&
                            // Additional check: ensure we've received enough data for actual video
                            report.bytesReceived > 100000 // rough threshold
                        ) {
                            videoDetected = true;
                            detectionMethod = 'bytesReceived';
                        }
                    }
                });
                if (videoDetected && !this.successMetricFired) {
                    this.recordSessionSuccess(detectionMethod !== null && detectionMethod !== void 0 ? detectionMethod : 'unknown');
                    if (this.successMetricPoller) {
                        clearInterval(this.successMetricPoller);
                    }
                    clearTimeout(timeoutId);
                    this.successMetricPoller = null;
                }
            }
            catch (error) { }
        }), 500);
    }
    muteInputAudio() {
        const oldAudioState = this.inputAudioState;
        const newAudioState = Object.assign(Object.assign({}, this.inputAudioState), { isMuted: true });
        this.inputAudioState = newAudioState;
        this.onInputAudioStateChange(oldAudioState, newAudioState);
        return this.inputAudioState;
    }
    unmuteInputAudio() {
        const oldAudioState = this.inputAudioState;
        const newAudioState = Object.assign(Object.assign({}, this.inputAudioState), { isMuted: false });
        this.inputAudioState = newAudioState;
        this.onInputAudioStateChange(oldAudioState, newAudioState);
        return this.inputAudioState;
    }
    getInputAudioState() {
        return this.inputAudioState;
    }
    getPeerConnection() {
        return this.peerConnection;
    }
    changeAudioInputDevice(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peerConnection) {
                throw new Error('StreamingClient - changeAudioInputDevice: peer connection is not initialized. Start streaming first.');
            }
            if (deviceId === null || deviceId === undefined) {
                throw new Error('StreamingClient - changeAudioInputDevice: deviceId is required');
            }
            // Store the current mute state to preserve it
            const wasMuted = this.inputAudioState.isMuted;
            try {
                // Stop the current audio stream tracks
                if (this.inputAudioStream) {
                    this.inputAudioStream.getAudioTracks().forEach((track) => {
                        track.stop();
                    });
                }
                // Request new audio stream with the new device ID
                const audioConstraints = {
                    echoCancellation: true,
                    deviceId: {
                        exact: deviceId,
                    },
                };
                this.inputAudioStream = yield navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints,
                });
                // Update the stored device ID
                this.audioDeviceId = deviceId;
                // Replace the audio track in the peer connection
                yield this.setupAudioTrack();
                // Restore the mute state
                if (wasMuted) {
                    this.muteAllAudioTracks();
                }
                // Emit event to notify that the device has changed
                this.publicEventEmitter.emit(AnamEvent.INPUT_AUDIO_DEVICE_CHANGED, deviceId);
            }
            catch (error) {
                console.error('Failed to change audio input device:', error);
                throw new Error(`StreamingClient - changeAudioInputDevice: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }
    getInputAudioStream() {
        return this.inputAudioStream;
    }
    getVideoStream() {
        return this.videoStream;
    }
    getAudioStream() {
        return this.audioStream;
    }
    onToolCallResultReceived(payload) {
        const message = {
            session_id: payload.sessionId,
            message_type: 'tool_result',
            tool_call_id: payload.toolCallId,
            user_action_correlation_id: payload.userActionCorrelationId,
            timestamp_user_action: payload.timestampUserAction,
        };
        if (payload.result !== undefined) {
            message.result = payload.result;
        }
        if (payload.errorMessage) {
            message.error = payload.errorMessage;
        }
        this.sendDataMessage(JSON.stringify(message));
    }
    sendDataMessage(message) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(message);
            return true;
        }
        return false;
    }
    setMediaStreamTargetById(videoElementId) {
        // set up streaming targets
        if (videoElementId) {
            const videoElement = document.getElementById(videoElementId);
            if (!videoElement) {
                throw new Error(`StreamingClient: video element with id ${videoElementId} not found`);
            }
            this.videoElement = videoElement;
        }
    }
    startConnection() {
        var _a;
        try {
            if (this.peerConnection) {
                console.error('StreamingClient - startConnection: peer connection already exists');
                return;
            }
            this.resetAttemptScopedMilestoneState();
            (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('connection_start_requested');
            // start the connection
            this.signallingClient.connect();
        }
        catch (error) {
            console.error('StreamingClient - startConnection: error', error);
            this.handleWebrtcFailure(error);
        }
    }
    resetAttemptScopedMilestoneState() {
        this.firstLocalIceCandidateSent = false;
        this.firstRemoteIceCandidateReceived = false;
        this.firstRemoteIceCandidateApplied = false;
        this.connectionEstablishedMilestoneRecorded = false;
    }
    stopConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.shutdown();
        });
    }
    sendTalkCommand(content) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peerConnection) {
                throw new Error('StreamingClient - sendTalkCommand: peer connection is null');
            }
            yield this.engineApiRestClient.sendTalkCommand(content);
            return;
        });
    }
    startTalkMessageStream(correlationId) {
        if (!correlationId) {
            // generate a random correlation uuid
            correlationId = Math.random().toString(36).substring(2, 15);
        }
        return new TalkMessageStream(correlationId, this.internalEventEmitter, this.signallingClient);
    }
    createAgentAudioInputStream(config) {
        this.agentAudioInputStream = new AgentAudioInputStream(config, this.signallingClient);
        return this.agentAudioInputStream;
    }
    getAgentAudioInputStream() {
        return this.agentAudioInputStream;
    }
    initPeerConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('peer_connection_creating');
            this.peerConnection = new RTCPeerConnection(Object.assign(Object.assign({ 
                // SDK default first (caller's rtcConfiguration may override it)
                iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE }, this.rtcConfiguration), { iceTransportPolicy: (_d = (_c = (_b = this.rtcConfiguration) === null || _b === void 0 ? void 0 : _b.iceTransportPolicy) !== null && _c !== void 0 ? _c : this.iceTransportPolicy) !== null && _d !== void 0 ? _d : undefined, 
                // resolved iceServers always wins for its field (preserves backward compat)
                iceServers: this.iceServers }));
            (_e = this.connectionMilestones) === null || _e === void 0 ? void 0 : _e.record('peer_connection_created', {
                iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE,
                iceServerCount: this.iceServers.length,
                iceTransportPolicy: (_h = (_g = (_f = this.rtcConfiguration) === null || _f === void 0 ? void 0 : _f.iceTransportPolicy) !== null && _g !== void 0 ? _g : this.iceTransportPolicy) !== null && _h !== void 0 ? _h : 'all',
            });
            // set event handlers
            this.peerConnection.onicecandidate = this.onIceCandidate.bind(this);
            this.peerConnection.oniceconnectionstatechange =
                this.onIceConnectionStateChange.bind(this);
            this.peerConnection.onconnectionstatechange =
                this.onConnectionStateChange.bind(this);
            this.peerConnection.addEventListener('track', this.onTrackEventHandler.bind(this));
            // set up data channels
            yield this.setupDataChannels();
            // add transceivers
            this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
            if (this.disableInputAudio) {
                (_j = this.connectionMilestones) === null || _j === void 0 ? void 0 : _j.record('microphone_permission_skipped', {
                    reason: 'input_audio_disabled',
                });
                this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });
            }
            else {
                this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
                // Handle audio setup after transceivers are configured
                if (this.inputAudioStream) {
                    (_k = this.connectionMilestones) === null || _k === void 0 ? void 0 : _k.record('input_audio_stream_provided', {
                        audioTrackCount: this.inputAudioStream.getAudioTracks().length,
                    });
                    // User provided an audio stream, set it up immediately
                    yield this.setupAudioTrack();
                }
                else {
                    // No user stream, start microphone permission request asynchronously
                    // Don't await - let it run in parallel with connection setup
                    this.requestMicrophonePermissionAsync().catch((error) => {
                        console.error('Async microphone permission request failed:', error);
                    });
                }
            }
        });
    }
    onSignalMessage(signalMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            if (!this.peerConnection) {
                console.error('StreamingClient - onSignalMessage: peerConnection is not initialized');
                return;
            }
            switch (signalMessage.actionType) {
                case SignalMessageAction.ANSWER: {
                    (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('answer_received');
                    const answer = signalMessage.payload;
                    if (this.peerConnection.signalingState !== 'have-local-offer') {
                        // Late answer to a superseded / rolled-back restart offer — ignore it so
                        // it cannot be applied in a stable state or against a different offer.
                        break;
                    }
                    try {
                        yield this.peerConnection.setRemoteDescription(answer);
                    }
                    catch (err) {
                        console.error('StreamingClient - setRemoteDescription(answer) failed', err);
                        if (!this.connectionEstablishedEmitted &&
                            !this.isAwaitingRestartAnswer()) {
                            // Initial-connection answer: no restart watchdog will retry, so
                            // surface the failure instead of hanging the connection. Once the
                            // session has been established, any answer is a restart answer
                            // (even if ICE recovered on its own and cleared the restart flags
                            // before it arrived) — ICE-failure handling owns recovery then.
                            this.handleWebrtcFailure(err);
                        }
                        break; // restart answers: let the ICE restart watchdog retry
                    }
                    (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('remote_description_set');
                    this.connectionReceivedAnswer = true;
                    this.onAnswerAccepted();
                    // flush the remote buffer
                    yield this.flushRemoteIceCandidateBuffer();
                    break;
                }
                case SignalMessageAction.ICE_CANDIDATE: {
                    const iceCandidateConfig = signalMessage.payload;
                    const candidate = new RTCIceCandidate(iceCandidateConfig);
                    if (!this.firstRemoteIceCandidateReceived) {
                        this.firstRemoteIceCandidateReceived = true;
                        (_c = this.connectionMilestones) === null || _c === void 0 ? void 0 : _c.record('first_remote_ice_candidate_received', getIceCandidateMilestoneTags(candidate));
                    }
                    if (this.connectionReceivedAnswer) {
                        yield this.addRemoteIceCandidate(candidate);
                    }
                    else {
                        this.remoteIceCandidateBuffer.push(candidate);
                    }
                    break;
                }
                case SignalMessageAction.END_SESSION:
                    const reason = signalMessage.payload;
                    // Server-ended session mid-restart counts as aborted; user hang-up doesn't.
                    this.sendIceRestartMetric('aborted');
                    (_d = this.connectionMilestones) === null || _d === void 0 ? void 0 : _d.publishFailure({
                        failureStage: 'server_closed_connection',
                    });
                    this.publicEventEmitter.emit(AnamEvent.CONNECTION_CLOSED, ConnectionClosedCode.SERVER_CLOSED_CONNECTION, reason);
                    // close the peer connection
                    this.shutdown();
                    break;
                case SignalMessageAction.WARNING:
                    const message = signalMessage.payload;
                    console.warn('Warning received from server: ' + message);
                    this.publicEventEmitter.emit(AnamEvent.SERVER_WARNING, message);
                    break;
                case SignalMessageAction.TALK_STREAM_INTERRUPTED:
                    const chatMessage = signalMessage.payload;
                    this.publicEventEmitter.emit(AnamEvent.TALK_STREAM_INTERRUPTED, chatMessage.correlationId);
                    break;
                case SignalMessageAction.SESSION_READY:
                    const sessionId = signalMessage.sessionId;
                    this.publicEventEmitter.emit(AnamEvent.SESSION_READY, sessionId);
                    break;
                case SignalMessageAction.HEARTBEAT:
                    break;
                default:
                    console.warn('StreamingClient - onSignalMessage: unknown signal message action type. Is your @anam-ai/js-sdk version up to date?', signalMessage);
            }
        });
    }
    onSignallingClientConnected() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peerConnection) {
                try {
                    yield this.initPeerConnectionAndSendOffer();
                }
                catch (err) {
                    console.error('StreamingClient - onSignallingClientConnected: Error initializing peer connection', err);
                    this.handleWebrtcFailure(err);
                }
            }
        });
    }
    flushRemoteIceCandidateBuffer() {
        return __awaiter(this, void 0, void 0, function* () {
            const bufferedCandidates = [...this.remoteIceCandidateBuffer];
            this.remoteIceCandidateBuffer = [];
            for (const candidate of bufferedCandidates) {
                yield this.addRemoteIceCandidate(candidate);
            }
        });
    }
    /**
     * Add a single remote ICE candidate to the peer connection.
     * Each candidate is added independently: a rejection on one candidate is
     * logged and swallowed so it cannot abort the flush loop (dropping the
     * remaining buffered candidates) or surface as an unhandled rejection from
     * the ANSWER handler. The "first applied" milestone is only recorded after a
     * genuine, successful add.
     */
    addRemoteIceCandidate(candidate) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.peerConnection) {
                return;
            }
            try {
                yield this.peerConnection.addIceCandidate(candidate);
                this.recordFirstRemoteIceCandidateApplied(candidate);
            }
            catch (error) {
                console.warn('StreamingClient - addRemoteIceCandidate: failed to add remote ICE candidate', error);
            }
        });
    }
    recordFirstRemoteIceCandidateApplied(candidate) {
        var _a;
        if (this.firstRemoteIceCandidateApplied) {
            return;
        }
        this.firstRemoteIceCandidateApplied = true;
        (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('first_remote_ice_candidate_applied', getIceCandidateMilestoneTags(candidate));
    }
    /**
     * ICE Candidate Trickle
     * As each ICE candidate is gathered from the STUN server it is sent to the
     * webRTC server immediately in an effort to reduce time to connection.
     */
    onIceCandidate(event) {
        var _a, _b;
        if (event.candidate) {
            if (!this.firstLocalIceCandidateSent) {
                this.firstLocalIceCandidateSent = true;
                (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('first_local_ice_candidate_sent', getIceCandidateMilestoneTags(event.candidate));
            }
            if (this.iceRestartCandidateBuffer) {
                // Hold until the re-offer is sent (see restartIce).
                this.iceRestartCandidateBuffer.push(event.candidate);
                return;
            }
            this.signallingClient.sendIceCandidate(event.candidate);
        }
        else {
            (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('ice_gathering_complete');
        }
    }
    onIceConnectionStateChange() {
        var _a, _b, _c;
        const state = (_a = this.peerConnection) === null || _a === void 0 ? void 0 : _a.iceConnectionState;
        if (state) {
            (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('ice_connection_state_changed', {
                iceConnectionState: state,
            });
        }
        switch (state) {
            case 'connected':
            case 'completed':
                this.clearIceDisconnectedGraceTimer();
                this.clearIceRestartWatchdog();
                this.iceRestartInProgress = false;
                this.sendIceRestartMetric('recovered'); // before the attempts reset below
                this.iceRestartAttempts = 0;
                this.signallingClient.endIceRestartReconnect();
                if (!this.connectionEstablishedMilestoneRecorded) {
                    this.connectionEstablishedMilestoneRecorded = true;
                    (_c = this.connectionMilestones) === null || _c === void 0 ? void 0 : _c.record('client_connection_established', {
                        iceConnectionState: state,
                    });
                }
                if (!this.connectionEstablishedEmitted) {
                    this.connectionEstablishedEmitted = true;
                    this.publicEventEmitter.emit(AnamEvent.CONNECTION_ESTABLISHED);
                }
                this.startStatsCollection(); // idempotent (guards on statsCollectionInterval)
                break;
            case 'disconnected':
                this.scheduleIceRestartAfterGrace();
                break;
            case 'failed':
                this.clearIceDisconnectedGraceTimer();
                void this.restartIce();
                break;
        }
    }
    clearIceDisconnectedGraceTimer() {
        if (this.iceDisconnectedGraceTimer) {
            clearTimeout(this.iceDisconnectedGraceTimer);
            this.iceDisconnectedGraceTimer = null;
        }
    }
    clearIceRestartWatchdog() {
        if (this.iceRestartWatchdogTimer) {
            clearTimeout(this.iceRestartWatchdogTimer);
            this.iceRestartWatchdogTimer = null;
        }
    }
    // One metric per restart episode, sent at episode end. No-op when no
    // episode is active; deliberately silent on user shutdown mid-episode.
    sendIceRestartMetric(outcome) {
        var _a;
        if (this.iceRestartEpisodeStartMs === null) {
            return;
        }
        const durationMs = Math.round(performance.now() - this.iceRestartEpisodeStartMs);
        const trigger = (_a = this.iceRestartEpisodeTrigger) !== null && _a !== void 0 ? _a : 'unknown';
        this.iceRestartEpisodeStartMs = null;
        this.iceRestartEpisodeTrigger = null;
        // durationMs is the value, not a tag: near-unique tag values explode
        // InfluxDB series cardinality. Episode count = count of points.
        sendClientMetric(ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_ICE_RESTART, durationMs, {
            outcome,
            attempts: this.iceRestartAttempts,
            trigger,
        });
    }
    // True while a restart offer is outstanding (in-progress gate, awaited-answer
    // grace cycle, or armed watchdog) — i.e. an incoming answer belongs to an ICE
    // restart rather than the initial connection.
    isAwaitingRestartAnswer() {
        return (this.iceRestartInProgress ||
            this.iceRestartAwaitedAnswer ||
            this.iceRestartWatchdogTimer !== null);
    }
    onAnswerAccepted() {
        var _a;
        const wasAwaitingRestartAnswer = this.isAwaitingRestartAnswer();
        this.clearIceRestartWatchdog();
        this.iceRestartAwaitedAnswer = false;
        if (!wasAwaitingRestartAnswer) {
            return;
        }
        this.iceRestartInProgress = false;
        const state = (_a = this.peerConnection) === null || _a === void 0 ? void 0 : _a.iceConnectionState;
        if (state === 'disconnected' || state === 'failed') {
            this.scheduleIceRestartAfterGrace();
        }
    }
    // Clears the pending ensureSignallingConnected wait (timeout + listener).
    clearPendingWsOpenWait() {
        if (this.pendingWsOpenTimeout) {
            clearTimeout(this.pendingWsOpenTimeout);
            this.pendingWsOpenTimeout = null;
        }
        if (this.pendingWsOpenListener) {
            this.internalEventEmitter.removeListener(InternalEvent.WEB_SOCKET_OPEN, this.pendingWsOpenListener);
            this.pendingWsOpenListener = null;
        }
        this.pendingWsOpenReject = null;
    }
    // Stops all restart activity: timers, pending WS wait, and the in-progress gate.
    cancelIceRestart() {
        this.clearIceDisconnectedGraceTimer();
        this.clearIceRestartWatchdog();
        const reject = this.pendingWsOpenReject;
        this.clearPendingWsOpenWait();
        if (reject)
            reject(new Error('ice restart cancelled'));
        this.iceRestartCandidateBuffer = null;
        this.iceRestartInProgress = false;
        // End the metric episode: a late END_SESSION after shutdown must not
        // count the hang-up as an aborted restart.
        this.iceRestartEpisodeStartMs = null;
        this.iceRestartEpisodeTrigger = null;
        this.signallingClient.endIceRestartReconnect();
    }
    // Send any candidates buffered while the re-offer was minted+sent, then stop
    // buffering (see restartIce/onIceCandidate).
    flushIceRestartCandidateBuffer() {
        const buffered = this.iceRestartCandidateBuffer;
        this.iceRestartCandidateBuffer = null;
        if (!buffered)
            return;
        for (const candidate of buffered) {
            this.signallingClient.sendIceCandidate(candidate);
        }
    }
    scheduleIceRestartAfterGrace() {
        if (this.iceRestartStopped ||
            this.iceRestartInProgress ||
            this.iceDisconnectedGraceTimer) {
            return;
        }
        this.iceDisconnectedGraceTimer = setTimeout(() => {
            var _a;
            this.iceDisconnectedGraceTimer = null;
            if (this.iceRestartStopped)
                return;
            const state = (_a = this.peerConnection) === null || _a === void 0 ? void 0 : _a.iceConnectionState;
            if (state === 'disconnected' || state === 'failed') {
                void this.restartIce();
            }
        }, ICE_DISCONNECTED_GRACE_MS);
    }
    /**
     * Resolve once the signalling WebSocket is open (it auto-reconnects on close),
     * or reject if it is terminally closed / times out. Restart offers must never
     * be sent on a dead socket. Timeout + listener are stored so shutdown can clear
     * them (see clearPendingWsOpenWait).
     */
    ensureSignallingConnected() {
        if (this.signallingClient.isConnected()) {
            return Promise.resolve();
        }
        if (this.signallingClient.isPermanentlyClosed()) {
            return Promise.reject(new Error('signalling permanently closed'));
        }
        return new Promise((resolve, reject) => {
            this.pendingWsOpenReject = reject;
            this.pendingWsOpenTimeout = setTimeout(() => {
                this.clearPendingWsOpenWait();
                reject(new Error('timed out waiting for signalling WebSocket'));
            }, ENSURE_WS_OPEN_TIMEOUT_MS);
            const onOpen = () => {
                this.clearPendingWsOpenWait();
                resolve();
            };
            this.pendingWsOpenListener = onOpen;
            this.internalEventEmitter.addListener(InternalEvent.WEB_SOCKET_OPEN, onOpen);
        });
    }
    /**
     * Automatic ICE restart. Mints a new offer with fresh ICE credentials and
     * sends it over the existing channel. Bounded retries via a watchdog; on
     * exhaustion or terminal signalling, falls back to the WebRTC-failure path.
     */
    restartIce() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.peerConnection ||
                this.iceRestartInProgress ||
                this.iceRestartStopped) {
                return;
            }
            if (this.signallingClient.isPermanentlyClosed()) {
                // Session is already ending via the signalling layer; stop spinning.
                this.sendIceRestartMetric('aborted');
                this.cancelIceRestart();
                return;
            }
            if (this.iceRestartAttempts >= MAX_ICE_RESTART_ATTEMPTS) {
                console.error('StreamingClient - restartIce: exhausted attempts');
                (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.publishFailure({
                    failureStage: 'ice_connection',
                    iceConnectionState: (_b = this.peerConnection) === null || _b === void 0 ? void 0 : _b.iceConnectionState,
                });
                this.sendIceRestartMetric('exhausted');
                this.cancelIceRestart();
                this.handleWebrtcFailure('The connection to our servers was lost. Please try again.');
                return;
            }
            if (this.iceRestartAttempts === 0) {
                this.iceRestartEpisodeStartMs = performance.now();
                this.iceRestartEpisodeTrigger = this.peerConnection.iceConnectionState;
            }
            // Set the in-progress gate BEFORE any await so a concurrent trigger
            // (watchdog retry + ICE 'failed' event) cannot start a second restart.
            this.iceRestartInProgress = true;
            this.iceRestartAttempts += 1;
            try {
                // Avoid offer glare: only start a fresh offer from a stable signalling state.
                if (this.peerConnection.signalingState !== 'stable') {
                    yield this.peerConnection.setLocalDescription({ type: 'rollback' });
                }
                // On the first attempt of a restart episode, force a fresh signalling
                // socket. A network switch can leave the old one half-open (readyState
                // still OPEN, no close event), so the offer would be sent into a dead
                // socket and never reach the server. Retries (attempt > 1) reuse the
                // now-live socket so an in-flight answer isn't dropped.
                if (this.iceRestartAttempts === 1) {
                    this.signallingClient.reconnectForIceRestart();
                }
                yield this.ensureSignallingConnected();
                if (this.iceRestartStopped)
                    return;
                // ICE may have recovered on its own while we waited for signalling.
                const currentIceState = this.peerConnection.iceConnectionState;
                if (currentIceState === 'connected' || currentIceState === 'completed') {
                    this.iceRestartInProgress = false;
                    // No-ops if the connected handler already closed the episode.
                    this.sendIceRestartMetric('recovered');
                    this.signallingClient.endIceRestartReconnect();
                    return;
                }
                this.connectionReceivedAnswer = false;
                this.remoteIceCandidateBuffer = [];
                const offer = yield this.peerConnection.createOffer({ iceRestart: true });
                // Buffer local candidates that gather from setLocalDescription until the
                // re-offer is sent. The engine queues remote candidates only while it has
                // no remote description; during a restart it still holds the OLD ICE
                // credentials, so a candidate arriving before the re-offer is applied would
                // be added against the old generation and dropped. WS messages are handled
                // in order, so sending the offer first pins the new credentials server-side.
                this.iceRestartCandidateBuffer = [];
                yield this.peerConnection.setLocalDescription(offer);
                if (!this.peerConnection.localDescription) {
                    throw new Error('null local description after ICE restart offer');
                }
                yield this.signallingClient.sendOffer(this.peerConnection.localDescription);
                this.flushIceRestartCandidateBuffer();
                this.iceRestartAwaitedAnswer = false;
                this.clearIceRestartWatchdog();
                this.iceRestartWatchdogTimer = setTimeout(() => this.onIceRestartWatchdog(), ICE_RESTART_WATCHDOG_MS);
            }
            catch (err) {
                // The offer never made it out; drop candidates buffered for it (a retry
                // mints a fresh offer and gathers again).
                this.iceRestartCandidateBuffer = null;
                console.error('StreamingClient - restartIce: error', err);
                this.iceRestartInProgress = false;
                if (this.iceRestartStopped) {
                    this.cancelIceRestart();
                    return;
                }
                if (this.signallingClient.isPermanentlyClosed()) {
                    this.sendIceRestartMetric('aborted');
                    this.cancelIceRestart();
                    return; // signalling layer already emitted CONNECTION_CLOSED
                }
                this.clearIceRestartWatchdog();
                this.iceRestartWatchdogTimer = setTimeout(() => {
                    this.iceRestartWatchdogTimer = null;
                    void this.restartIce();
                }, ICE_RESTART_WATCHDOG_MS);
            }
        });
    }
    // Watchdog for an outstanding restart offer. Only rolls back and re-offers
    // once the current offer is resolved, so a second offer is never minted while
    // the first offer's answer is still in flight (the ANSWER handler could
    // otherwise apply it against the wrong offer).
    onIceRestartWatchdog() {
        var _a;
        this.iceRestartWatchdogTimer = null;
        this.iceRestartInProgress = false;
        if (this.iceRestartStopped)
            return;
        const state = (_a = this.peerConnection) === null || _a === void 0 ? void 0 : _a.iceConnectionState;
        if (state === 'connected' || state === 'completed')
            return;
        if (!this.connectionReceivedAnswer && !this.iceRestartAwaitedAnswer) {
            // Offer still unanswered: give the in-flight answer one more cycle before
            // rolling it back and re-offering.
            this.iceRestartAwaitedAnswer = true;
            this.iceRestartInProgress = true;
            this.iceRestartWatchdogTimer = setTimeout(() => this.onIceRestartWatchdog(), ICE_RESTART_WATCHDOG_MS);
            return;
        }
        void this.restartIce();
    }
    onConnectionStateChange() {
        var _a, _b, _c, _d, _e;
        const connectionState = (_a = this.peerConnection) === null || _a === void 0 ? void 0 : _a.connectionState;
        if (connectionState) {
            (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('webrtc_connection_state_changed', {
                connectionState,
            });
        }
        if (connectionState === 'failed') {
            const iceState = (_c = this.peerConnection) === null || _c === void 0 ? void 0 : _c.iceConnectionState;
            const recovering = !this.iceRestartStopped &&
                (iceState === 'disconnected' || iceState === 'failed');
            // A recoverable ICE failure also flips the aggregate state to 'failed'.
            // The recorder is first-call-wins, so don't finalize failure telemetry
            // while the ICE restart is still recovering; the terminal publish comes
            // from restartIce (exhausted) or the 'closed' branch below. A genuine
            // non-ICE failure (e.g. DTLS with ICE still connected) still publishes.
            if (!recovering) {
                (_d = this.connectionMilestones) === null || _d === void 0 ? void 0 : _d.publishFailure({
                    failureStage: 'webrtc_connection',
                    connectionState,
                });
            }
        }
        if (((_e = this.peerConnection) === null || _e === void 0 ? void 0 : _e.connectionState) === 'closed') {
            console.error('StreamingClient - onConnectionStateChange: Connection closed');
            this.handleWebrtcFailure('The connection to our servers was lost. Please try again.');
        }
    }
    handleWebrtcFailure(err) {
        var _a, _b;
        (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('webrtc_failure', getErrorTags(err));
        (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.publishFailure(Object.assign({ failureStage: 'webrtc' }, getErrorTags(err)));
        console.error({ message: 'StreamingClient - handleWebrtcFailure: ', err });
        if (err.name === 'NotAllowedError' && err.message === 'Permission denied') {
            this.publicEventEmitter.emit(AnamEvent.CONNECTION_CLOSED, ConnectionClosedCode.MICROPHONE_PERMISSION_DENIED);
        }
        else {
            this.publicEventEmitter.emit(AnamEvent.CONNECTION_CLOSED, ConnectionClosedCode.WEBRTC_FAILURE);
        }
        try {
            this.stopConnection();
        }
        catch (error) {
            console.error('StreamingClient - handleWebrtcFailure: error stopping connection', error);
        }
    }
    onTrackEventHandler(event) {
        var _a, _b;
        if (event.track.kind === 'video') {
            (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('video_track_received');
            // start polling stats to detect successful video data received
            this.startSuccessMetricPolling();
            this.videoStream = event.streams[0];
            this.publicEventEmitter.emit(AnamEvent.VIDEO_STREAM_STARTED, this.videoStream);
            if (this.videoElement) {
                this.videoElement.srcObject = this.videoStream;
                const handle = this.videoElement.requestVideoFrameCallback(() => {
                    var _a;
                    // unregister the callback after the first frame
                    (_a = this.videoElement) === null || _a === void 0 ? void 0 : _a.cancelVideoFrameCallback(handle);
                    this.publicEventEmitter.emit(AnamEvent.VIDEO_PLAY_STARTED);
                    this.recordSessionSuccess('videoElement');
                });
            }
        }
        else if (event.track.kind === 'audio') {
            (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('audio_track_received');
            this.audioStream = event.streams[0];
            this.publicEventEmitter.emit(AnamEvent.AUDIO_STREAM_STARTED, this.audioStream);
        }
    }
    /**
     * Set up the data channels for sending and receiving messages
     */
    setupDataChannels() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.peerConnection) {
                console.error('StreamingClient - setupDataChannels: peer connection is not initialized');
                return;
            }
            /**
             * Audio - Validate user-provided stream only
             *
             * If the user provided an audio stream, validate it has audio tracks
             * Microphone permission request will be handled asynchronously
             */
            if (!this.disableInputAudio && this.inputAudioStream) {
                // verify the user provided stream has audio tracks
                if (!this.inputAudioStream.getAudioTracks().length) {
                    throw new Error('StreamingClient - setupDataChannels: user provided stream does not have audio tracks');
                }
            }
            /**
             * Text
             *
             * Create the data channel for sending and receiving text.
             * There is no input stream for text, instead the sending of data is triggered by a UI interaction.
             */
            const dataChannel = this.peerConnection.createDataChannel('session', {
                ordered: true,
            });
            (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('data_channel_created');
            dataChannel.onopen = () => {
                var _a;
                this.dataChannel = dataChannel !== null && dataChannel !== void 0 ? dataChannel : null;
                (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('data_channel_open');
                this.publicEventEmitter.emit(AnamEvent.DATA_CHANNEL_OPEN);
            };
            dataChannel.onclose = () => {
                var _a;
                (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('data_channel_closed');
            };
            // pass text message to the message history client
            dataChannel.onmessage = (event) => {
                var _a, _b, _c, _d, _e, _f, _g;
                try {
                    const message = JSON.parse(event.data);
                    // Handle known message types
                    switch (message.messageType) {
                        case DataChannelMessage.SPEECH_TEXT:
                            this.internalEventEmitter.emit(InternalEvent.WEBRTC_CHAT_MESSAGE_RECEIVED, message.data);
                            break;
                        case DataChannelMessage.CLIENT_TOOL_EVENT:
                            // legacy support for client tool events sent via data channel. New events should use the dedicated tool call event messages
                            // newer engines should only be sending client tool events via the dedicated tool call event messages, but we will keep supporting this for older engine versions
                            const webRtcToolEvent = message.data;
                            this.internalEventEmitter.emit(InternalEvent.WEBRTC_CLIENT_TOOL_EVENT_RECEIVED, webRtcToolEvent);
                            const clientToolEvent = ToolCallManager.WebRTCClientToolEventToClientToolEvent(webRtcToolEvent);
                            this.publicEventEmitter.emit(AnamEvent.CLIENT_TOOL_EVENT_RECEIVED, clientToolEvent);
                            break;
                        case DataChannelMessage.TOOL_CALL_STARTED_EVENT:
                            const webRtcToolCallStartedEvent = message.data;
                            this.publicEventEmitter.emit(AnamEvent.TOOL_CALL_STARTED, this.toolCallManager.WebRTCToolCallStartedEventToToolCallStartedPayload(webRtcToolCallStartedEvent));
                            this.internalEventEmitter.emit(InternalEvent.WEBRTC_TOOL_CALL_STARTED_EVENT_RECEIVED, webRtcToolCallStartedEvent);
                            break;
                        case DataChannelMessage.TOOL_CALL_COMPLETED_EVENT:
                            const webRtcToolCallCompletedEvent = message.data;
                            this.publicEventEmitter.emit(AnamEvent.TOOL_CALL_COMPLETED, this.toolCallManager.webRTCToolCallCompletedEventToToolCallCompletedPayload(webRtcToolCallCompletedEvent));
                            this.internalEventEmitter.emit(InternalEvent.WEBRTC_TOOL_CALL_COMPLETED_EVENT_RECEIVED, webRtcToolCallCompletedEvent);
                            break;
                        case DataChannelMessage.TOOL_CALL_FAILED_EVENT:
                            const webRtcToolCallFailedEvent = message.data;
                            this.publicEventEmitter.emit(AnamEvent.TOOL_CALL_FAILED, this.toolCallManager.webRTCToolCallFailedEventToToolCallFailedPayload(webRtcToolCallFailedEvent));
                            this.internalEventEmitter.emit(InternalEvent.WEBRTC_TOOL_CALL_FAILED_EVENT_RECEIVED, webRtcToolCallFailedEvent);
                            break;
                        case DataChannelMessage.REASONING_TEXT:
                            this.internalEventEmitter.emit(InternalEvent.WEBRTC_REASONING_TEXT_MESSAGE_RECEIVED, message.data);
                            break;
                        case DataChannelMessage.USER_SPEECH_STARTED:
                            this.publicEventEmitter.emit(AnamEvent.USER_SPEECH_STARTED, (_b = (_a = message.data) === null || _a === void 0 ? void 0 : _a.user_action_correlation_id) !== null && _b !== void 0 ? _b : 'unknown');
                            break;
                        case DataChannelMessage.USER_SPEECH_ENDED:
                            this.publicEventEmitter.emit(AnamEvent.USER_SPEECH_ENDED, (_d = (_c = message.data) === null || _c === void 0 ? void 0 : _c.user_action_correlation_id) !== null && _d !== void 0 ? _d : 'unknown');
                            break;
                        case DataChannelMessage.DIRECTOR_NOTE_CUE_APPLIED:
                            const cueAppliedEvent = message.data;
                            this.publicEventEmitter.emit(AnamEvent.DIRECTOR_NOTE_CUE_APPLIED, {
                                cueTag: (_e = cueAppliedEvent === null || cueAppliedEvent === void 0 ? void 0 : cueAppliedEvent.cue_tag) !== null && _e !== void 0 ? _e : 'unknown',
                                correlationId: (_f = cueAppliedEvent === null || cueAppliedEvent === void 0 ? void 0 : cueAppliedEvent.user_action_correlation_id) !== null && _f !== void 0 ? _f : 'unknown',
                            });
                            break;
                        case DataChannelMessage.PERSONA_CONFIG_UPDATE_APPLIED:
                            const updateAppliedEvent = message.data;
                            this.publicEventEmitter.emit(AnamEvent.PERSONA_CONFIG_UPDATE_APPLIED, {
                                changedFields: (_g = updateAppliedEvent === null || updateAppliedEvent === void 0 ? void 0 : updateAppliedEvent.changed_fields) !== null && _g !== void 0 ? _g : {},
                            });
                            break;
                        // Unknown message types are silently ignored to maintain forward compatibility
                        default:
                            break;
                    }
                }
                catch (error) {
                    console.error('Failed to parse data channel message:', error);
                }
            };
        });
    }
    /**
     * Request microphone permission asynchronously without blocking connection
     */
    requestMicrophonePermissionAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (this.inputAudioState.permissionState === AudioPermissionState.PENDING) {
                return; // Already requesting
            }
            this.inputAudioState = Object.assign(Object.assign({}, this.inputAudioState), { permissionState: AudioPermissionState.PENDING });
            (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('microphone_permission_pending');
            this.publicEventEmitter.emit(AnamEvent.MIC_PERMISSION_PENDING);
            try {
                const audioConstraints = {
                    echoCancellation: true,
                };
                // If an audio device ID is provided in the options, use it
                if (this.audioDeviceId) {
                    audioConstraints.deviceId = {
                        exact: this.audioDeviceId,
                    };
                }
                this.inputAudioStream = yield navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints,
                });
                this.inputAudioState = Object.assign(Object.assign({}, this.inputAudioState), { permissionState: AudioPermissionState.GRANTED });
                (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('microphone_permission_granted');
                this.publicEventEmitter.emit(AnamEvent.MIC_PERMISSION_GRANTED);
                // Now add the audio track to the existing connection
                yield this.setupAudioTrack();
            }
            catch (error) {
                console.error('Failed to get microphone permission:', error);
                this.inputAudioState = Object.assign(Object.assign({}, this.inputAudioState), { permissionState: AudioPermissionState.DENIED });
                (_c = this.connectionMilestones) === null || _c === void 0 ? void 0 : _c.record('microphone_permission_denied', Object.assign({}, getErrorTags(error)));
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.publicEventEmitter.emit(AnamEvent.MIC_PERMISSION_DENIED, errorMessage);
            }
        });
    }
    /**
     * Set up audio track and add it to the peer connection using replaceTrack
     */
    setupAudioTrack() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.peerConnection || !this.inputAudioStream) {
                return;
            }
            // verify the stream has audio tracks
            if (!this.inputAudioStream.getAudioTracks().length) {
                console.error('StreamingClient - setupAudioTrack: stream does not have audio tracks');
                return;
            }
            // mute the audio tracks if the user has muted the microphone
            if (this.inputAudioState.isMuted) {
                this.muteAllAudioTracks();
            }
            const audioTrack = this.inputAudioStream.getAudioTracks()[0];
            // Find the audio sender
            const existingSenders = this.peerConnection.getSenders();
            const audioSender = existingSenders.find((sender) => {
                var _a;
                return ((_a = sender.track) === null || _a === void 0 ? void 0 : _a.kind) === 'audio' ||
                    (sender.track === null && sender.dtmf !== null);
            });
            if (audioSender) {
                // Replace existing track (or null track) with our audio track
                try {
                    yield audioSender.replaceTrack(audioTrack);
                }
                catch (error) {
                    console.error('Failed to replace audio track:', error);
                    // Fallback: add track normally
                    this.peerConnection.addTrack(audioTrack, this.inputAudioStream);
                }
            }
            else {
                // No audio sender found, add track normally
                this.peerConnection.addTrack(audioTrack, this.inputAudioStream);
            }
            // pass the stream to the callback
            (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('input_audio_stream_started', {
                audioTrackCount: this.inputAudioStream.getAudioTracks().length,
            });
            this.publicEventEmitter.emit(AnamEvent.INPUT_AUDIO_STREAM_STARTED, this.inputAudioStream);
        });
    }
    initPeerConnectionAndSendOffer() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            yield this.initPeerConnection();
            if (!this.peerConnection) {
                console.error('StreamingClient - initPeerConnectionAndSendOffer: peer connection is not initialized');
                return;
            }
            // create offer and set local description
            try {
                (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('offer_creation_started');
                const offer = yield this.peerConnection.createOffer();
                (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('offer_creation_completed');
                yield this.peerConnection.setLocalDescription(offer);
                (_c = this.connectionMilestones) === null || _c === void 0 ? void 0 : _c.record('local_description_set');
            }
            catch (error) {
                console.error('StreamingClient - initPeerConnectionAndSendOffer: error creating offer', error);
                (_d = this.connectionMilestones) === null || _d === void 0 ? void 0 : _d.record('offer_creation_failed', Object.assign({}, getErrorTags(error)));
                (_e = this.connectionMilestones) === null || _e === void 0 ? void 0 : _e.publishFailure(Object.assign({ failureStage: 'offer_creation' }, getErrorTags(error)));
            }
            if (!this.peerConnection.localDescription) {
                throw new Error('StreamingClient - initPeerConnectionAndSendOffer: local description is null');
            }
            yield this.signallingClient.sendOffer(this.peerConnection.localDescription);
            (_f = this.connectionMilestones) === null || _f === void 0 ? void 0 : _f.record('offer_sent');
        });
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.iceRestartStopped = true;
            this.cancelIceRestart();
            if (this.showPeerConnectionStatsReport) {
                const stats = yield ((_a = this.peerConnection) === null || _a === void 0 ? void 0 : _a.getStats());
                if (stats) {
                    const report = createRTCStatsReport(stats, this.peerConnectionStatsReportOutputFormat);
                    if (report) {
                        console.log(report, undefined, 2);
                    }
                }
            }
            // stop stats collection
            if (this.statsCollectionInterval) {
                clearInterval(this.statsCollectionInterval);
                this.statsCollectionInterval = null;
            }
            // reset video frame polling
            if (this.successMetricPoller) {
                clearInterval(this.successMetricPoller);
                this.successMetricPoller = null;
            }
            this.successMetricFired = false;
            // stop the input audio stream
            try {
                if (this.inputAudioStream) {
                    this.inputAudioStream.getTracks().forEach((track) => {
                        track.stop();
                    });
                }
                this.inputAudioStream = null;
            }
            catch (error) {
                console.error('StreamingClient - shutdown: error stopping input audio stream', error);
            }
            // stop the signalling client
            try {
                this.signallingClient.stop();
            }
            catch (error) {
                console.error('StreamingClient - shutdown: error stopping signallilng', error);
            }
            // close the peer connection
            try {
                if (this.peerConnection &&
                    this.peerConnection.connectionState !== 'closed') {
                    this.peerConnection.onconnectionstatechange = null;
                    this.peerConnection.close();
                    this.peerConnection = null;
                }
            }
            catch (error) {
                console.error('StreamingClient - shutdown: error closing peer connection', error);
            }
        });
    }
}
const getIceCandidateMilestoneTags = (candidate) => {
    const safeCandidate = candidate;
    return removeEmptyTags({
        candidateType: safeCandidate.type,
        protocol: safeCandidate.protocol,
        relayProtocol: safeCandidate.relayProtocol,
        tcpType: safeCandidate.tcpType,
        component: safeCandidate.component,
    });
};
const getErrorTags = (error) => {
    if (error instanceof Error) {
        return removeEmptyTags({ errorName: error.name });
    }
    if (typeof error === 'object' && error !== null) {
        const possibleError = error;
        return removeEmptyTags({
            errorName: typeof possibleError.name === 'string' ? possibleError.name : undefined,
            errorCode: typeof possibleError.code === 'string' ||
                typeof possibleError.code === 'number'
                ? possibleError.code
                : undefined,
        });
    }
    return {};
};
const removeEmptyTags = (tags) => {
    const sanitizedTags = {};
    Object.entries(tags).forEach(([key, value]) => {
        if (value !== undefined) {
            sanitizedTags[key] = value;
        }
    });
    return sanitizedTags;
};
//# sourceMappingURL=StreamingClient.js.map