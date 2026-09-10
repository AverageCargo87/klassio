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
exports.SignallingClient = void 0;
const types_1 = require("../types");
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 5;
const DEFAULT_WS_RECONNECTION_ATTEMPTS = 5;
const WEBSOCKET_STABLE_RECONNECTION_RESET_MS = 5000;
// Long enough to cover StreamingClient's full restart envelope:
// 3 attempts * (5s websocket-open wait + 3s restart watchdog) = 24s.
// With 100ms linear backoff this keeps signalling non-terminal for ~30s.
const ICE_RESTART_WS_RECONNECTION_ATTEMPTS = 24;
const API_GATEWAY_BACKEND_CLOSE_REASON_PREFIX = 'Backend WebSocket';
class SignallingClient {
    constructor(sessionId, options, publicEventEmitter, internalEventEmitter, apiGatewayConfig, connectionMilestones) {
        var _a, _b, _c, _d, _e;
        this.stopSignal = false;
        this.sendingBuffer = [];
        this.wsConnectionAttempts = 0;
        this.socket = null;
        this.permanentlyClosed = false;
        this.iceRestartReconnectInProgress = false;
        this.heartBeatIntervalRef = null;
        this.reconnectTimer = null;
        this.stableConnectionTimer = null;
        this.publicEventEmitter = publicEventEmitter;
        this.internalEventEmitter = internalEventEmitter;
        this.apiGatewayConfig = apiGatewayConfig;
        this.connectionMilestones = connectionMilestones;
        if (!sessionId) {
            throw new Error('Signalling Client: sessionId is required');
        }
        this.sessionId = sessionId;
        const { heartbeatIntervalSeconds, maxWsReconnectionAttempts, url } = options;
        this.heartbeatIntervalSeconds =
            heartbeatIntervalSeconds || DEFAULT_HEARTBEAT_INTERVAL_SECONDS;
        this.maxWsReconnectionAttempts =
            maxWsReconnectionAttempts || DEFAULT_WS_RECONNECTION_ATTEMPTS;
        if (!url.baseUrl) {
            throw new Error('Signalling Client: baseUrl is required');
        }
        // Construct WebSocket URL (with or without API Gateway)
        if (((_a = this.apiGatewayConfig) === null || _a === void 0 ? void 0 : _a.enabled) && ((_b = this.apiGatewayConfig) === null || _b === void 0 ? void 0 : _b.baseUrl)) {
            // Use API Gateway WebSocket URL
            const gatewayUrl = new URL(this.apiGatewayConfig.baseUrl);
            const wsPath = (_c = this.apiGatewayConfig.wsPath) !== null && _c !== void 0 ? _c : '/ws';
            // Construct gateway WebSocket URL
            gatewayUrl.protocol = gatewayUrl.protocol.replace('http', 'ws');
            gatewayUrl.pathname = wsPath;
            this.url = gatewayUrl;
            // Construct the complete target WebSocket URL and pass it as a query parameter
            const httpProtocol = url.protocol || 'https';
            const targetProtocol = httpProtocol === 'http' ? 'ws' : 'wss';
            const httpUrl = `${httpProtocol}://${url.baseUrl}`;
            const targetWsPath = (_d = url.signallingPath) !== null && _d !== void 0 ? _d : '/ws';
            // Build complete target URL
            const targetUrl = new URL(httpUrl);
            targetUrl.protocol = targetProtocol === 'ws' ? 'ws:' : 'wss:';
            if (url.port) {
                targetUrl.port = url.port;
            }
            targetUrl.pathname = targetWsPath;
            targetUrl.searchParams.append('session_id', sessionId);
            // Pass complete target URL as query parameter
            this.url.searchParams.append('target_url', targetUrl.href);
        }
        else {
            // Direct connection to Anam (original behavior)
            const httpProtocol = url.protocol || 'https';
            const initUrl = `${httpProtocol}://${url.baseUrl}`;
            this.url = new URL(initUrl);
            this.url.protocol = url.protocol === 'http' ? 'ws:' : 'wss:';
            if (url.port) {
                this.url.port = url.port;
            }
            this.url.pathname = (_e = url.signallingPath) !== null && _e !== void 0 ? _e : '/ws';
            this.url.searchParams.append('session_id', sessionId);
        }
    }
    stop() {
        this.stopSignal = true;
        this.closeSocket();
    }
    connect() {
        var _a;
        this.clearReconnectTimer();
        this.clearStableConnectionTimer();
        (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('websocket_connecting', {
            attemptNumber: this.wsConnectionAttempts + 1,
        });
        const socket = new WebSocket(this.url.href);
        this.socket = socket;
        socket.onopen = () => {
            void this.onOpen(socket);
        };
        socket.onclose = (event) => {
            void this.onClose(socket, event);
        };
        socket.onerror = (event) => {
            this.onError(socket, event);
        };
        return socket;
    }
    /**
     * Force a fresh signalling socket for an ICE restart. A network switch can
     * leave the existing socket half-open (readyState stays OPEN with no 'close'
     * event), so a restart offer sent on it is silently dropped. Detach the stale
     * socket's handlers so its eventual close does not drive the reconnect backoff,
     * drop it, and open a new connection. While the new network path is still dead,
     * use an ICE-restart-specific retry budget so signalling does not terminally
     * close before StreamingClient's websocket-open wait can time out and retry.
     */
    reconnectForIceRestart() {
        if (this.isPermanentlyClosed()) {
            return;
        }
        this.clearReconnectTimer();
        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.onmessage = null;
            try {
                this.socket.close();
            }
            catch (err) {
                // A half-open socket may throw on close; the reconnect proceeds regardless.
                console.warn('SignallingClient - reconnectForIceRestart: error closing stale socket', err);
            }
            this.socket = null;
        }
        this.clearHeartbeatInterval();
        this.wsConnectionAttempts = 0;
        this.iceRestartReconnectInProgress = true;
        this.connect();
    }
    /**
     * Ends the ICE-restart reconnect episode: subsequent closes use the default
     * retry budget again. Called by StreamingClient when the restart succeeds,
     * is cancelled, or exhausts its attempts.
     */
    endIceRestartReconnect() {
        this.iceRestartReconnectInProgress = false;
    }
    isConnected() {
        var _a;
        return ((_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN;
    }
    isPermanentlyClosed() {
        return this.permanentlyClosed || this.stopSignal;
    }
    sendOffer(localDescription) {
        return __awaiter(this, void 0, void 0, function* () {
            const offerMessagePayload = {
                connectionDescription: localDescription,
                userUid: this.sessionId, // TODO: this should be renamed to session ID on the server
            };
            const offerMessage = {
                actionType: types_1.SignalMessageAction.OFFER,
                sessionId: this.sessionId,
                payload: offerMessagePayload,
            };
            this.sendSignalMessage(offerMessage);
        });
    }
    sendIceCandidate(candidate) {
        return __awaiter(this, void 0, void 0, function* () {
            const iceCandidateMessage = {
                actionType: types_1.SignalMessageAction.ICE_CANDIDATE,
                sessionId: this.sessionId,
                payload: candidate.toJSON(),
            };
            this.sendSignalMessage(iceCandidateMessage);
        });
    }
    sendSignalMessage(message) {
        var _a;
        if (((_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(message));
            }
            catch (error) {
                console.error('SignallingClient - sendSignalMessage: error sending message', error);
            }
        }
        else {
            this.sendingBuffer.push(message);
        }
    }
    sendTalkMessage(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const chatMessage = {
                actionType: types_1.SignalMessageAction.TALK_STREAM_INPUT,
                sessionId: this.sessionId,
                payload: payload,
            };
            this.sendSignalMessage(chatMessage);
        });
    }
    sendAgentAudioInput(payload) {
        const message = {
            actionType: types_1.SignalMessageAction.AGENT_AUDIO_INPUT,
            sessionId: this.sessionId,
            payload: payload,
        };
        this.sendSignalMessage(message);
    }
    sendAgentAudioInputEnd() {
        const message = {
            actionType: types_1.SignalMessageAction.AGENT_AUDIO_INPUT_END,
            sessionId: this.sessionId,
            payload: {},
        };
        this.sendSignalMessage(message);
    }
    closeSocket() {
        this.clearReconnectTimer();
        this.clearStableConnectionTimer();
        this.iceRestartReconnectInProgress = false;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.clearHeartbeatInterval();
    }
    onOpen(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.socket !== socket) {
                return;
            }
            try {
                (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('websocket_open', {
                    attemptNumber: this.wsConnectionAttempts + 1,
                });
                // Keep iceRestartReconnectInProgress (the extended retry budget) until
                // StreamingClient ends the episode: a socket that opens briefly and drops
                // again mid-restart must not fall back to the short default budget.
                this.scheduleStableConnectionReset(socket);
                this.flushSendingBuffer();
                socket.onmessage = this.onMessage.bind(this);
                this.startSendingHeartBeats();
                this.internalEventEmitter.emit(types_1.InternalEvent.WEB_SOCKET_OPEN);
            }
            catch (e) {
                console.error('SignallingClient - onOpen: error in onOpen', e);
                this.publicEventEmitter.emit(types_1.AnamEvent.CONNECTION_CLOSED, types_1.ConnectionClosedCode.SIGNALLING_CLIENT_CONNECTION_FAILURE);
                this.permanentlyClosed = true;
            }
        });
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    clearStableConnectionTimer() {
        if (this.stableConnectionTimer) {
            clearTimeout(this.stableConnectionTimer);
            this.stableConnectionTimer = null;
        }
    }
    clearHeartbeatInterval() {
        if (this.heartBeatIntervalRef) {
            clearInterval(this.heartBeatIntervalRef);
            this.heartBeatIntervalRef = null;
        }
    }
    scheduleStableConnectionReset(socket) {
        this.clearStableConnectionTimer();
        this.stableConnectionTimer = setTimeout(() => {
            this.stableConnectionTimer = null;
            if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
                this.wsConnectionAttempts = 0;
            }
        }, WEBSOCKET_STABLE_RECONNECTION_RESET_MS);
    }
    onClose(socket, event) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (this.socket !== socket) {
                return;
            }
            this.clearStableConnectionTimer();
            this.clearHeartbeatInterval();
            (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('websocket_closed', {
                attemptNumber: this.wsConnectionAttempts + 1,
                closeCode: event === null || event === void 0 ? void 0 : event.code,
                closeReason: event === null || event === void 0 ? void 0 : event.reason,
                wasClean: event === null || event === void 0 ? void 0 : event.wasClean,
            });
            this.wsConnectionAttempts += 1;
            if (this.stopSignal) {
                return;
            }
            const maxReconnectionAttempts = this.getMaxReconnectionAttempts(event);
            if (this.shouldRetryCloseEvent(event) &&
                this.wsConnectionAttempts <= maxReconnectionAttempts) {
                const retryDelayMs = 100 * this.wsConnectionAttempts;
                (_b = this.connectionMilestones) === null || _b === void 0 ? void 0 : _b.record('websocket_retry_scheduled', {
                    attemptNumber: this.wsConnectionAttempts + 1,
                    delayMs: retryDelayMs,
                });
                this.socket = null;
                this.clearReconnectTimer();
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    this.connect();
                }, retryDelayMs);
            }
            else {
                this.clearReconnectTimer();
                this.clearHeartbeatInterval();
                (_c = this.connectionMilestones) === null || _c === void 0 ? void 0 : _c.publishFailure({
                    failureStage: 'websocket',
                    closeCode: event === null || event === void 0 ? void 0 : event.code,
                    closeReason: event === null || event === void 0 ? void 0 : event.reason,
                });
                this.publicEventEmitter.emit(types_1.AnamEvent.CONNECTION_CLOSED, types_1.ConnectionClosedCode.SIGNALLING_CLIENT_CONNECTION_FAILURE);
                this.iceRestartReconnectInProgress = false;
                this.permanentlyClosed = true;
            }
        });
    }
    getMaxReconnectionAttempts(event) {
        if (!this.iceRestartReconnectInProgress ||
            this.isApiGatewayBackendClose(event)) {
            return this.maxWsReconnectionAttempts;
        }
        return Math.max(this.maxWsReconnectionAttempts, ICE_RESTART_WS_RECONNECTION_ATTEMPTS);
    }
    shouldRetryCloseEvent(event) {
        // Dev Cloudflare workers use 1008 for backend 401/403. That is a policy
        // failure rather than a transient network close, so retrying just hammers
        // the edge with requests that cannot succeed.
        return !(this.isApiGatewayBackendClose(event) && (event === null || event === void 0 ? void 0 : event.code) === 1008);
    }
    isApiGatewayBackendClose(event) {
        var _a;
        return (((_a = this.apiGatewayConfig) === null || _a === void 0 ? void 0 : _a.enabled) === true &&
            typeof (event === null || event === void 0 ? void 0 : event.reason) === 'string' &&
            event.reason.startsWith(API_GATEWAY_BACKEND_CLOSE_REASON_PREFIX));
    }
    onError(socket, event) {
        var _a;
        if (this.stopSignal || this.socket !== socket) {
            return;
        }
        (_a = this.connectionMilestones) === null || _a === void 0 ? void 0 : _a.record('websocket_error', {
            eventType: event.type,
        });
        console.error('SignallingClient - onError: ', event);
    }
    flushSendingBuffer() {
        const newBuffer = [];
        if (this.sendingBuffer.length > 0) {
            this.sendingBuffer.forEach((message) => {
                var _a;
                if (((_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify(message));
                }
                else {
                    newBuffer.push(message);
                }
            });
        }
        this.sendingBuffer = newBuffer;
    }
    onMessage(event) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = JSON.parse(event.data);
            this.internalEventEmitter.emit(types_1.InternalEvent.SIGNAL_MESSAGE_RECEIVED, message);
        });
    }
    startSendingHeartBeats() {
        if (!this.socket) {
            throw new Error('SignallingClient - startSendingHeartBeats: socket is null');
        }
        if (this.heartBeatIntervalRef) {
            console.warn('SignallingClient - startSendingHeartBeats: heartbeat interval already set');
        }
        // send a heartbeat message every heartbeatIntervalSeconds
        const heartbeatInterval = this.heartbeatIntervalSeconds * 1000;
        const heartbeatMessage = {
            actionType: types_1.SignalMessageAction.HEARTBEAT,
            sessionId: this.sessionId,
            payload: '',
        };
        const heartbeatMessageJson = JSON.stringify(heartbeatMessage);
        this.heartBeatIntervalRef = setInterval(() => {
            var _a;
            if (this.stopSignal) {
                return;
            }
            if (((_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState) === WebSocket.OPEN) {
                this.socket.send(heartbeatMessageJson);
            }
        }, heartbeatInterval);
    }
}
exports.SignallingClient = SignallingClient;
//# sourceMappingURL=SignallingClient.js.map