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
const buffer_1 = require("buffer");
const ClientError_1 = require("./lib/ClientError");
const ClientMetrics_1 = require("./lib/ClientMetrics");
const correlationId_1 = require("./lib/correlationId");
const ConnectionMilestones_1 = require("./lib/ConnectionMilestones");
const validateApiGatewayConfig_1 = require("./lib/validateApiGatewayConfig");
const modules_1 = require("./modules");
const types_1 = require("./types");
const ToolCallManager_1 = require("./modules/ToolCallManager");
class AnamClient {
    constructor(sessionToken, personaConfig, options) {
        var _a, _b, _c, _d, _e;
        this.inputAudioState = {
            isMuted: false,
            permissionState: types_1.AudioPermissionState.NOT_REQUESTED,
        };
        this.sessionId = null;
        this.servedRegion = null;
        this.organizationId = null;
        this.streamingClient = null;
        this._isStreaming = false;
        const configError = this.validateClientConfig(sessionToken, personaConfig, options);
        if (configError) {
            throw new ClientError_1.ClientError(configError, ClientError_1.ErrorCode.CLIENT_ERROR_CODE_CONFIGURATION_ERROR, 400);
        }
        this.personaConfig = personaConfig;
        this.clientOptions = options;
        if (((_a = options === null || options === void 0 ? void 0 : options.api) === null || _a === void 0 ? void 0 : _a.baseUrl) || ((_b = options === null || options === void 0 ? void 0 : options.api) === null || _b === void 0 ? void 0 : _b.apiVersion)) {
            (0, ClientMetrics_1.setClientMetricsBaseUrl)(options.api.baseUrl || ClientMetrics_1.DEFAULT_ANAM_METRICS_BASE_URL, options.api.apiVersion || ClientMetrics_1.DEFAULT_ANAM_API_VERSION);
        }
        // Pass API Gateway config to metrics module so metrics are routed through the gateway
        if ((_d = (_c = options === null || options === void 0 ? void 0 : options.api) === null || _c === void 0 ? void 0 : _c.apiGateway) === null || _d === void 0 ? void 0 : _d.enabled) {
            (0, ClientMetrics_1.setClientMetricsApiGateway)(options.api.apiGateway);
        }
        // Allow disabling client metrics telemetry
        if ((_e = options === null || options === void 0 ? void 0 : options.metrics) === null || _e === void 0 ? void 0 : _e.disableClientMetrics) {
            (0, ClientMetrics_1.setClientMetricsDisabled)(true);
        }
        this.publicEventEmitter = new modules_1.PublicEventEmitter();
        this.internalEventEmitter = new modules_1.InternalEventEmitter();
        this.toolCallManager = new ToolCallManager_1.ToolCallManager(this.publicEventEmitter, this.internalEventEmitter);
        this.apiClient = new modules_1.CoreApiRestClient(sessionToken, options === null || options === void 0 ? void 0 : options.apiKey, options === null || options === void 0 ? void 0 : options.api);
        this.messageHistoryClient = new modules_1.MessageHistoryClient(this.publicEventEmitter, this.internalEventEmitter);
        this.reasoningHistoryClient = new modules_1.ReasoningHistoryClient(this.publicEventEmitter, this.internalEventEmitter);
    }
    decodeJwt(token) {
        try {
            const base64Payload = token.split('.')[1];
            const payloadString = buffer_1.Buffer.from(base64Payload, 'base64').toString('utf8');
            const payload = JSON.parse(payloadString);
            return payload;
        }
        catch (error) {
            throw new Error('Invalid session token format');
        }
    }
    validateClientConfig(sessionToken, personaConfig, options) {
        var _a, _b;
        // Validate authentication configuration
        if (!sessionToken && !(options === null || options === void 0 ? void 0 : options.apiKey)) {
            return 'Either sessionToken or apiKey must be provided';
        }
        if ((options === null || options === void 0 ? void 0 : options.apiKey) && sessionToken) {
            return 'Only one of sessionToken or apiKey should be used';
        }
        // Validate gateway configuration
        const apiGatewayError = (0, validateApiGatewayConfig_1.validateApiGatewayConfig)((_a = options === null || options === void 0 ? void 0 : options.api) === null || _a === void 0 ? void 0 : _a.apiGateway);
        if (apiGatewayError) {
            return apiGatewayError;
        }
        // Validate persona configuration based on session token
        if (sessionToken) {
            const decodedToken = this.decodeJwt(sessionToken);
            this.organizationId = decodedToken.accountId;
            (0, ClientMetrics_1.setMetricsContext)({
                organizationId: this.organizationId,
            });
            const tokenType = (_b = decodedToken.type) === null || _b === void 0 ? void 0 : _b.toLowerCase();
            if (tokenType === 'legacy') {
                return 'Legacy session tokens are no longer supported. Please define your persona when creating your session token. See https://docs.anam.ai/resources/migrating-legacy for more information.';
            }
            else if (tokenType === 'ephemeral' || tokenType === 'stateful') {
                if (personaConfig) {
                    return 'This session token already contains a persona configuration. Please remove the personaConfig parameter.';
                }
            }
        }
        else {
            // No session token (using apiKey)
            if (!personaConfig) {
                return 'Missing persona config. Persona configuration must be provided when using apiKey';
            }
        }
        const personaConfigError = getPersonaConfigValidationError(personaConfig);
        if (personaConfigError) {
            return personaConfigError;
        }
        // Validate voice detection configuration
        if (options === null || options === void 0 ? void 0 : options.voiceDetection) {
            if (options.disableInputAudio) {
                return 'Voice detection is disabled because input audio is disabled. Please set disableInputAudio to false to enable voice detection.';
            }
            // End of speech sensitivity must be a number between 0 and 1
            if (options.voiceDetection.endOfSpeechSensitivity !== undefined) {
                if (typeof options.voiceDetection.endOfSpeechSensitivity !== 'number') {
                    return 'End of speech sensitivity must be a number';
                }
                if (options.voiceDetection.endOfSpeechSensitivity < 0 ||
                    options.voiceDetection.endOfSpeechSensitivity > 1) {
                    return 'End of speech sensitivity must be between 0 and 1';
                }
            }
        }
        return undefined;
    }
    buildStartSessionOptionsForClient() {
        var _a;
        const sessionOptions = {};
        if ((_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.voiceDetection) {
            sessionOptions.voiceDetection = this.clientOptions.voiceDetection;
        }
        // return undefined if no options are set
        if (Object.keys(sessionOptions).length === 0) {
            return undefined;
        }
        return sessionOptions;
    }
    startConnectionAttempt() {
        var _a, _b, _c, _d;
        const attemptCorrelationId = (0, correlationId_1.generateCorrelationId)();
        (0, ClientMetrics_1.setMetricsContext)({
            attemptCorrelationId,
            sessionId: null,
            organizationId: this.organizationId,
        });
        const connectionMilestones = new ConnectionMilestones_1.ClientConnectionMilestoneRecorder({
            context: {
                attemptCorrelationId,
                sessionId: null,
                organizationId: this.organizationId,
            },
            connectionMilestoneSampleRatio: (_b = (_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.metrics) === null || _b === void 0 ? void 0 : _b.connectionMilestoneSampleRatio,
            slowConnectionThresholdMs: (_d = (_c = this.clientOptions) === null || _c === void 0 ? void 0 : _c.metrics) === null || _d === void 0 ? void 0 : _d.slowConnectionThresholdMs,
        });
        (0, ClientMetrics_1.sendClientMetric)(ClientMetrics_1.ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_SESSION_ATTEMPT, '1');
        return connectionMilestones;
    }
    startSession(userProvidedAudioStream, connectionMilestones) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
            const config = this.personaConfig;
            this.validatePersonaConfigOrThrow(config);
            // build session options from client options
            const sessionOptions = this.buildStartSessionOptionsForClient();
            // start a new session
            connectionMilestones === null || connectionMilestones === void 0 ? void 0 : connectionMilestones.record('start_session_request_started');
            let response;
            try {
                response = yield this.apiClient.startSession(config, sessionOptions);
                connectionMilestones === null || connectionMilestones === void 0 ? void 0 : connectionMilestones.record('start_session_request_completed');
            }
            catch (error) {
                connectionMilestones === null || connectionMilestones === void 0 ? void 0 : connectionMilestones.record('start_session_request_failed', Object.assign({}, getErrorMilestoneTags(error)));
                connectionMilestones === null || connectionMilestones === void 0 ? void 0 : connectionMilestones.publishFailure(Object.assign({ failureStage: 'start_session_request' }, getErrorMilestoneTags(error)));
                throw error;
            }
            const { sessionId, clientConfig, engineHost, engineProtocol, signallingEndpoint, region, } = response;
            const { heartbeatIntervalSeconds, maxWsReconnectionAttempts, iceServers: defaultIceServers, iceTransportPolicy, } = clientConfig;
            this.sessionId = sessionId;
            this.servedRegion = region !== null && region !== void 0 ? region : null;
            this.toolCallManager.setActiveSession(sessionId);
            (0, ClientMetrics_1.setMetricsContext)({
                sessionId: this.sessionId,
            });
            connectionMilestones === null || connectionMilestones === void 0 ? void 0 : connectionMilestones.updateContext({
                sessionId: this.sessionId,
                organizationId: this.organizationId,
            });
            // Use custom ICE servers if provided, otherwise use server-provided ICE servers.
            // Precedence: top-level `iceServers` > `rtcConfiguration.iceServers` > server default.
            const iceServers = (_e = (_b = (_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.iceServers) !== null && _b !== void 0 ? _b : (_d = (_c = this.clientOptions) === null || _c === void 0 ? void 0 : _c.rtcConfiguration) === null || _d === void 0 ? void 0 : _d.iceServers) !== null && _e !== void 0 ? _e : defaultIceServers;
            try {
                this.streamingClient = new modules_1.StreamingClient(sessionId, {
                    engine: {
                        baseUrl: `${engineProtocol}://${engineHost}`,
                    },
                    signalling: {
                        heartbeatIntervalSeconds,
                        maxWsReconnectionAttempts,
                        url: {
                            baseUrl: engineHost,
                            protocol: engineProtocol,
                            signallingPath: signallingEndpoint,
                        },
                    },
                    iceServers,
                    iceTransportPolicy,
                    rtcConfiguration: (_f = this.clientOptions) === null || _f === void 0 ? void 0 : _f.rtcConfiguration,
                    inputAudio: {
                        inputAudioState: this.inputAudioState,
                        userProvidedMediaStream: ((_g = this.clientOptions) === null || _g === void 0 ? void 0 : _g.disableInputAudio)
                            ? undefined
                            : userProvidedAudioStream,
                        audioDeviceId: (_h = this.clientOptions) === null || _h === void 0 ? void 0 : _h.audioDeviceId,
                        disableInputAudio: (_j = this.clientOptions) === null || _j === void 0 ? void 0 : _j.disableInputAudio,
                    },
                    apiGateway: (_l = (_k = this.clientOptions) === null || _k === void 0 ? void 0 : _k.api) === null || _l === void 0 ? void 0 : _l.apiGateway,
                    metrics: {
                        showPeerConnectionStatsReport: (_p = (_o = (_m = this.clientOptions) === null || _m === void 0 ? void 0 : _m.metrics) === null || _o === void 0 ? void 0 : _o.showPeerConnectionStatsReport) !== null && _p !== void 0 ? _p : false,
                        peerConnectionStatsReportOutputFormat: (_s = (_r = (_q = this.clientOptions) === null || _q === void 0 ? void 0 : _q.metrics) === null || _r === void 0 ? void 0 : _r.peerConnectionStatsReportOutputFormat) !== null && _s !== void 0 ? _s : 'console',
                    },
                }, this.publicEventEmitter, this.internalEventEmitter, this.toolCallManager, connectionMilestones);
            }
            catch (error) {
                connectionMilestones === null || connectionMilestones === void 0 ? void 0 : connectionMilestones.publishFailure(Object.assign({ failureStage: 'streaming_client_initialization' }, getErrorMilestoneTags(error)));
                this.toolCallManager.clearSessionState();
                this.servedRegion = null;
                (0, ClientMetrics_1.setMetricsContext)({
                    sessionId: null,
                });
                throw new ClientError_1.ClientError('Failed to initialize streaming client', ClientError_1.ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, 500, {
                    cause: error instanceof Error ? error.message : String(error),
                    sessionId,
                });
            }
            return sessionId;
        });
    }
    startSessionIfNeeded(userProvidedAudioStream, connectionMilestones) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.sessionId || !this.streamingClient) {
                yield this.startSession(userProvidedAudioStream, connectionMilestones);
                if (!this.sessionId || !this.streamingClient) {
                    connectionMilestones === null || connectionMilestones === void 0 ? void 0 : connectionMilestones.publishFailure({
                        failureStage: 'start_session_validation',
                    });
                    throw new ClientError_1.ClientError('Session ID or streaming client is not available after starting session', ClientError_1.ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, 500, {
                        cause: 'Failed to initialize session properly',
                    });
                }
            }
        });
    }
    stream(userProvidedAudioStream) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this._isStreaming) {
                throw new Error('Already streaming');
            }
            const connectionMilestones = this.startConnectionAttempt();
            if (((_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.disableInputAudio) && userProvidedAudioStream) {
                console.warn('AnamClient: Input audio is disabled. User-provided audio stream will be ignored.');
            }
            try {
                yield this.startSessionIfNeeded(userProvidedAudioStream, connectionMilestones);
            }
            catch (error) {
                connectionMilestones.publishFailure(Object.assign({ failureStage: 'start_session' }, getErrorMilestoneTags(error)));
                throw error;
            }
            this._isStreaming = true;
            return new Promise((resolve) => {
                var _a;
                // set stream callbacks to capture the stream
                const streams = [];
                let videoReceived = false;
                let audioReceived = false;
                this.publicEventEmitter.addListener(types_1.AnamEvent.VIDEO_STREAM_STARTED, (videoStream) => {
                    streams.push(videoStream);
                    videoReceived = true;
                    if (audioReceived) {
                        resolve(streams);
                    }
                });
                this.publicEventEmitter.addListener(types_1.AnamEvent.AUDIO_STREAM_STARTED, (audioStream) => {
                    streams.push(audioStream);
                    audioReceived = true;
                    if (videoReceived) {
                        resolve(streams);
                    }
                });
                // start streaming
                (_a = this.streamingClient) === null || _a === void 0 ? void 0 : _a.startConnection();
            });
        });
    }
    /**
     * @deprecated This method is deprecated. Please use streamToVideoElement instead.
     */
    streamToVideoAndAudioElements(videoElementId, audioElementId, userProvidedAudioStream) {
        return __awaiter(this, void 0, void 0, function* () {
            console.warn('AnamClient: streamToVideoAndAudioElements is deprecated. To avoid possible audio issues, please use streamToVideoElement instead.');
            yield this.streamToVideoElement(videoElementId, userProvidedAudioStream);
        });
    }
    streamToVideoElement(videoElementId, userProvidedAudioStream) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const connectionMilestones = this.startConnectionAttempt();
            if (((_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.disableInputAudio) && userProvidedAudioStream) {
                console.warn('AnamClient: Input audio is disabled. User-provided audio stream will be ignored.');
            }
            try {
                yield this.startSessionIfNeeded(userProvidedAudioStream, connectionMilestones);
            }
            catch (error) {
                connectionMilestones.publishFailure(Object.assign({ failureStage: 'start_session' }, getErrorMilestoneTags(error)));
                if (error instanceof ClientError_1.ClientError) {
                    throw error;
                }
                throw new ClientError_1.ClientError('Failed to start session', ClientError_1.ErrorCode.CLIENT_ERROR_CODE_SERVER_ERROR, 500, {
                    cause: error instanceof Error ? error.message : String(error),
                    sessionId: this.sessionId,
                });
            }
            if (this._isStreaming) {
                connectionMilestones.publishFailure({
                    failureStage: 'already_streaming',
                });
                throw new Error('Already streaming');
            }
            this._isStreaming = true;
            if (!this.streamingClient) {
                connectionMilestones.publishFailure({
                    failureStage: 'streaming_client_missing',
                });
                throw new Error('Failed to stream: streaming client is not available');
            }
            try {
                this.streamingClient.setMediaStreamTargetById(videoElementId);
                this.streamingClient.startConnection();
            }
            catch (error) {
                connectionMilestones.publishFailure(Object.assign({ failureStage: 'start_connection' }, getErrorMilestoneTags(error)));
                throw error;
            }
        });
    }
    /**
     * Send a talk command to make the persona speak the provided content.
     * @param content - The text content for the persona to speak
     * @throws Error if session is not started or not currently streaming
     */
    talk(content) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.streamingClient) {
                throw new Error('Failed to send talk command: session is not started. Have you called startSession?');
            }
            if (!this._isStreaming) {
                throw new Error('Failed to send talk command: not currently streaming. Have you called stream?');
            }
            yield this.streamingClient.sendTalkCommand(content);
            return;
        });
    }
    /**
     * Send a raw data message through the WebRTC data channel.
     * @param message - The message string to send through the data channel
     * @throws Error if session is not started
     */
    sendDataMessage(message) {
        if (this.streamingClient) {
            this.streamingClient.sendDataMessage(message);
        }
        else {
            throw new Error('Failed to send message: session is not started.');
        }
    }
    /**
     * Send a user text message in the active streaming session.
     * @param content - The text message content to send
     * @throws Error if not currently streaming or session is not started
     */
    sendUserMessage(content) {
        if (!this._isStreaming) {
            console.warn('AnamClient: Not currently streaming. User message will not be sent.');
            throw new Error('Failed to send user message: not currently streaming');
        }
        const sessionId = this.getActiveSessionId();
        if (!sessionId) {
            throw new Error('Failed to send user message: no active session');
        }
        const currentTimestamp = new Date().toISOString().replace('Z', '');
        const body = JSON.stringify({
            content,
            timestamp: currentTimestamp,
            session_id: sessionId,
            message_type: 'speech',
        });
        this.sendDataMessage(body);
    }
    interruptPersona() {
        if (!this._isStreaming) {
            throw new Error('Failed to send interrupt command: not currently streaming');
        }
        const sessionId = this.getActiveSessionId();
        if (!sessionId) {
            throw new Error('Failed to send interrupt command: no active session');
        }
        const body = JSON.stringify({
            message_type: 'interrupt',
            session_id: sessionId,
            timestamp: new Date().toISOString(), // Removing the trailing Z is unnecessary.
        });
        this.sendDataMessage(body);
    }
    /**
     * Add context information to the active streaming session.
     * This allows injecting additional context (e.g., DOM state, user actions)
     * that the persona can use to inform its responses.
     * @param content - The context content string to send
     * @throws Error if not currently streaming or no active session
     */
    addContext(content) {
        if (!this._isStreaming) {
            throw new Error('Failed to add context: not currently streaming');
        }
        const sessionId = this.getActiveSessionId();
        if (!sessionId) {
            throw new Error('Failed to add context: no active session');
        }
        const body = JSON.stringify({
            message_type: 'context',
            session_id: sessionId,
            content,
        });
        this.sendDataMessage(body);
    }
    /**
     * Send a Director Note cue to the active streaming session without purging
     * buffered audio or video (Cara 4 avatars only).
     *
     * Omit timing to apply the cue immediately. `inSeconds` delays from now;
     * `atSeconds` targets an absolute offset from the start of persona speech.
     *
     * @param tag - Runtime performance cue understood by the engine.
     * @param options - Optional mutually exclusive cue timing.
     * @throws Error if not currently streaming, if the data channel is not open,
     * or if the cue is invalid
     */
    sendDirectorNoteCue(tag, options = {}) {
        var _a;
        if (!this._isStreaming) {
            throw new Error('Failed to send Director Note cue: not currently streaming');
        }
        if (typeof tag !== 'string' || tag.length === 0) {
            throw new Error('Failed to send Director Note cue: tag must not be empty');
        }
        if (buffer_1.Buffer.byteLength(tag, 'utf8') > 64) {
            throw new Error('Failed to send Director Note cue: tag must not exceed 64 bytes');
        }
        if (!types_1.DIRECTOR_NOTE_CUE_TAGS.includes(tag)) {
            throw new Error(`Failed to send Director Note cue: unsupported tag "${tag}"`);
        }
        const { inSeconds, atSeconds } = options;
        if (inSeconds !== undefined && atSeconds !== undefined) {
            throw new Error('Failed to send Director Note cue: provide only one of inSeconds or atSeconds');
        }
        for (const [name, value] of [
            ['inSeconds', inSeconds],
            ['atSeconds', atSeconds],
        ]) {
            if (value !== undefined &&
                (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
                throw new Error(`Failed to send Director Note cue: ${name} must be a finite non-negative number`);
            }
        }
        const body = JSON.stringify(Object.assign(Object.assign({ message_type: 'director_note_cue', cue: { tag } }, (inSeconds !== undefined ? { in_seconds: inSeconds } : {})), (atSeconds !== undefined ? { at_seconds: atSeconds } : {})));
        if (!((_a = this.streamingClient) === null || _a === void 0 ? void 0 : _a.sendDataMessage(body))) {
            throw new Error('Failed to send Director Note cue: data channel is not open');
        }
    }
    stopStreaming() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.streamingClient) {
                this.publicEventEmitter.emit(types_1.AnamEvent.CONNECTION_CLOSED, types_1.ConnectionClosedCode.NORMAL);
                this.toolCallManager.clearSessionState();
                yield this.streamingClient.stopConnection();
                this.streamingClient = null;
                this.sessionId = null;
                this.servedRegion = null;
                (0, ClientMetrics_1.setMetricsContext)({
                    attemptCorrelationId: null,
                    sessionId: null,
                    organizationId: this.organizationId,
                });
                this._isStreaming = false;
            }
        });
    }
    isStreaming() {
        return this._isStreaming;
    }
    setPersonaConfig(personaConfig) {
        this.validatePersonaConfigOrThrow(personaConfig);
        this.personaConfig = personaConfig;
    }
    getPersonaConfig() {
        return this.personaConfig;
    }
    getInputAudioState() {
        var _a;
        if ((_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.disableInputAudio) {
            console.warn('AnamClient: Audio state will not be used because input audio is disabled.');
        }
        // if streaming client is available, make sure our state is up to date
        if (this.streamingClient) {
            this.inputAudioState = this.streamingClient.getInputAudioState();
        }
        return this.inputAudioState;
    }
    muteInputAudio() {
        var _a, _b;
        if ((_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.disableInputAudio) {
            console.warn('AnamClient: Input audio is disabled. Muting input audio will have no effect.');
        }
        if (this.streamingClient && !((_b = this.clientOptions) === null || _b === void 0 ? void 0 : _b.disableInputAudio)) {
            this.inputAudioState = this.streamingClient.muteInputAudio();
        }
        else {
            this.inputAudioState = Object.assign(Object.assign({}, this.inputAudioState), { isMuted: true });
        }
        return this.inputAudioState;
    }
    unmuteInputAudio() {
        var _a, _b;
        if ((_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.disableInputAudio) {
            console.warn('AnamClient: Input audio is disabled. Unmuting input audio will have no effect.');
        }
        if (this.streamingClient && !((_b = this.clientOptions) === null || _b === void 0 ? void 0 : _b.disableInputAudio)) {
            this.inputAudioState = this.streamingClient.unmuteInputAudio();
        }
        else {
            this.inputAudioState = Object.assign(Object.assign({}, this.inputAudioState), { isMuted: false });
        }
        return this.inputAudioState;
    }
    changeAudioInputDevice(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if ((_a = this.clientOptions) === null || _a === void 0 ? void 0 : _a.disableInputAudio) {
                throw new Error('AnamClient: Cannot change audio input device because input audio is disabled.');
            }
            if (!this._isStreaming) {
                throw new Error('AnamClient: Cannot change audio input device while not streaming. Start streaming first.');
            }
            if (!this.streamingClient) {
                throw new Error('AnamClient: Cannot change audio input device because streaming client is not available. Start streaming first.');
            }
            yield this.streamingClient.changeAudioInputDevice(deviceId);
        });
    }
    createTalkMessageStream(correlationId) {
        if (!this.streamingClient) {
            throw new Error('Failed to start talk message stream: session is not started.');
        }
        if (correlationId && correlationId.trim() === '') {
            throw new Error('Failed to start talk message stream: correlationId is empty');
        }
        return this.streamingClient.startTalkMessageStream(correlationId);
    }
    createAgentAudioInputStream(config) {
        if (!this.streamingClient) {
            throw new Error('Failed to create agent audio input stream: session is not started.');
        }
        return this.streamingClient.createAgentAudioInputStream(config);
    }
    /**
     * Event handling
     */
    addListener(event, callback) {
        this.publicEventEmitter.addListener(event, callback);
    }
    removeListener(event, callback) {
        this.publicEventEmitter.removeListener(event, callback);
    }
    getActiveSessionId() {
        return this.sessionId;
    }
    getActiveSessionRegion() {
        return this.servedRegion;
    }
    registerToolCallHandler(toolName, handler) {
        return this.toolCallManager.registerHandler(toolName, handler);
    }
    validatePersonaConfigOrThrow(personaConfig) {
        const configError = getPersonaConfigValidationError(personaConfig);
        if (configError) {
            throw new ClientError_1.ClientError(configError, ClientError_1.ErrorCode.CLIENT_ERROR_CODE_CONFIGURATION_ERROR, 400);
        }
    }
}
exports.default = AnamClient;
const getErrorMilestoneTags = (error) => {
    if (error instanceof ClientError_1.ClientError) {
        return {
            errorName: error.name,
            errorCode: error.code,
            httpStatusCode: error.statusCode,
        };
    }
    if (error instanceof Error) {
        return { errorName: error.name };
    }
    return {};
};
const isValidDirectorNotesExpressivity = (value) => typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
const getPersonaConfigValidationError = (personaConfig) => {
    var _a;
    const directorNotesExpressivity = (_a = personaConfig === null || personaConfig === void 0 ? void 0 : personaConfig.directorNotes) === null || _a === void 0 ? void 0 : _a.expressivity;
    if (directorNotesExpressivity !== undefined &&
        !isValidDirectorNotesExpressivity(directorNotesExpressivity)) {
        return 'Director Notes expressivity must be a finite number between 0 and 1';
    }
    return undefined;
};
//# sourceMappingURL=AnamClient.js.map