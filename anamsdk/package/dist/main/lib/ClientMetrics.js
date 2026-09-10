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
exports.createRTCStatsReport = exports.sendClientMetrics = exports.sendClientMetric = exports.setMetricsContext = exports.setClientMetricsDisabled = exports.setClientMetricsApiGateway = exports.setClientMetricsBaseUrl = exports.ClientMetricMeasurement = exports.DEFAULT_ANAM_API_VERSION = exports.DEFAULT_ANAM_METRICS_BASE_URL = void 0;
const constants_1 = require("./constants");
exports.DEFAULT_ANAM_METRICS_BASE_URL = 'https://api.anam.ai';
exports.DEFAULT_ANAM_API_VERSION = '/v1';
var ClientMetricMeasurement;
(function (ClientMetricMeasurement) {
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_ERROR"] = "client_error";
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_CONNECTION_CLOSED"] = "client_connection_closed";
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_CONNECTION_ESTABLISHED"] = "client_connection_established";
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_CONNECTION_MILESTONE"] = "client_connection_milestone";
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_CONNECTION_MILESTONES"] = "client_connection_milestones";
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_SESSION_ATTEMPT"] = "client_session_attempt";
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_SESSION_SUCCESS"] = "client_session_success";
    ClientMetricMeasurement["CLIENT_METRIC_MEASUREMENT_ICE_RESTART"] = "client_ice_restart";
})(ClientMetricMeasurement || (exports.ClientMetricMeasurement = ClientMetricMeasurement = {}));
const CLIENT_METRICS_MAX_BATCH_SIZE = 50;
let anamCurrentBaseUrl = exports.DEFAULT_ANAM_METRICS_BASE_URL;
let anamCurrentApiVersion = exports.DEFAULT_ANAM_API_VERSION;
let apiGatewayConfig;
let metricsDisabled = false;
const setClientMetricsBaseUrl = (baseUrl, apiVersion = exports.DEFAULT_ANAM_API_VERSION) => {
    anamCurrentBaseUrl = baseUrl;
    anamCurrentApiVersion = apiVersion;
};
exports.setClientMetricsBaseUrl = setClientMetricsBaseUrl;
const setClientMetricsApiGateway = (config) => {
    apiGatewayConfig = config;
};
exports.setClientMetricsApiGateway = setClientMetricsApiGateway;
const setClientMetricsDisabled = (disabled) => {
    metricsDisabled = disabled;
};
exports.setClientMetricsDisabled = setClientMetricsDisabled;
let anamMetricsContext = {
    sessionId: null,
    organizationId: null,
    attemptCorrelationId: null,
};
const setMetricsContext = (context) => {
    anamMetricsContext = Object.assign(Object.assign({}, anamMetricsContext), context);
};
exports.setMetricsContext = setMetricsContext;
const sendClientMetric = (name, value, tags) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, exports.sendClientMetrics)([{ name, value, tags }]);
});
exports.sendClientMetric = sendClientMetric;
const sendClientMetrics = (metrics) => __awaiter(void 0, void 0, void 0, function* () {
    // Skip sending metrics if disabled
    if (metricsDisabled || metrics.length === 0) {
        return;
    }
    try {
        // Determine URL and headers based on API Gateway configuration
        const targetPath = `${anamCurrentApiVersion}/metrics/client`;
        let url;
        const headers = {
            'Content-Type': 'application/json',
        };
        if ((apiGatewayConfig === null || apiGatewayConfig === void 0 ? void 0 : apiGatewayConfig.enabled) && (apiGatewayConfig === null || apiGatewayConfig === void 0 ? void 0 : apiGatewayConfig.baseUrl)) {
            // Route through gateway
            url = `${apiGatewayConfig.baseUrl}${targetPath}`;
            headers['X-Anam-Target-Url'] = `${anamCurrentBaseUrl}${targetPath}`;
        }
        else {
            // Direct call to Anam API
            url = `${anamCurrentBaseUrl}${targetPath}`;
        }
        const normalizedMetrics = metrics.map((metric) => {
            var _a;
            return (Object.assign(Object.assign({}, metric), { clientTimestamp: (_a = metric.clientTimestamp) !== null && _a !== void 0 ? _a : new Date().toISOString(), tags: buildMetricTags(metric.tags) }));
        });
        for (let batchStart = 0; batchStart < normalizedMetrics.length; batchStart += CLIENT_METRICS_MAX_BATCH_SIZE) {
            const batch = normalizedMetrics.slice(batchStart, batchStart + CLIENT_METRICS_MAX_BATCH_SIZE);
            const body = batch.length === 1
                ? batch[0]
                : {
                    metrics: batch,
                };
            yield fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
        }
    }
    catch (error) {
        console.error('Failed to send client metric:', error);
    }
});
exports.sendClientMetrics = sendClientMetrics;
const buildMetricTags = (tags) => {
    const metricTags = Object.assign(Object.assign({}, constants_1.CLIENT_METADATA), tags);
    // Fill session/organization/attempt IDs from the global context, but only
    // when the caller did not already supply them. Callers that pass their own
    // context (e.g. the connection-milestones recorder, which pins each metric
    // to the attempt it belongs to) are authoritative; the global singleton is
    // mutated by every new attempt and must not overwrite a caller's snapshot.
    if (anamMetricsContext.sessionId && metricTags.sessionId === undefined) {
        metricTags.sessionId = anamMetricsContext.sessionId;
    }
    if (anamMetricsContext.organizationId &&
        metricTags.organizationId === undefined) {
        metricTags.organizationId = anamMetricsContext.organizationId;
    }
    if (anamMetricsContext.attemptCorrelationId &&
        metricTags.attemptCorrelationId === undefined) {
        metricTags.attemptCorrelationId = anamMetricsContext.attemptCorrelationId;
    }
    return metricTags;
};
const createRTCStatsReport = (stats, outputFormat = 'console') => {
    /**
     * constructs a report of the RTC stats for logging to the console or returns as JSON
     */
    var _a, _b, _c;
    // Collect stats by type for organized reporting
    const statsByType = {};
    stats.forEach((report) => {
        if (!statsByType[report.type]) {
            statsByType[report.type] = [];
        }
        statsByType[report.type].push(report);
    });
    // Initialize JSON report structure
    const jsonReport = {
        issues: [],
    };
    // Build video statistics (Persona video output)
    const inboundVideo = ((_a = statsByType['inbound-rtp']) === null || _a === void 0 ? void 0 : _a.filter((r) => r.kind === 'video')) || [];
    if (inboundVideo.length > 0) {
        jsonReport.personaVideoStream = [];
        inboundVideo.forEach((report) => {
            var _a, _b, _c, _d, _e;
            const videoData = {
                framesReceived: (_a = report.framesReceived) !== null && _a !== void 0 ? _a : 'unknown',
                framesDropped: (_b = report.framesDropped) !== null && _b !== void 0 ? _b : 'unknown',
                framesPerSecond: (_c = report.framesPerSecond) !== null && _c !== void 0 ? _c : 'unknown',
                packetsReceived: (_d = report.packetsReceived) !== null && _d !== void 0 ? _d : 'unknown',
                packetsLost: (_e = report.packetsLost) !== null && _e !== void 0 ? _e : 'unknown',
                resolution: report.frameWidth && report.frameHeight
                    ? `${report.frameWidth}x${report.frameHeight}`
                    : undefined,
                jitter: report.jitter !== undefined ? report.jitter : undefined,
            };
            jsonReport.personaVideoStream.push(videoData);
        });
    }
    // Build audio statistics (Persona audio output)
    const inboundAudio = ((_b = statsByType['inbound-rtp']) === null || _b === void 0 ? void 0 : _b.filter((r) => r.kind === 'audio')) || [];
    if (inboundAudio.length > 0) {
        jsonReport.personaAudioStream = [];
        inboundAudio.forEach((report) => {
            var _a, _b, _c;
            const audioData = {
                packetsReceived: (_a = report.packetsReceived) !== null && _a !== void 0 ? _a : 'unknown',
                packetsLost: (_b = report.packetsLost) !== null && _b !== void 0 ? _b : 'unknown',
                audioLevel: (_c = report.audioLevel) !== null && _c !== void 0 ? _c : 'unknown',
                jitter: report.jitter !== undefined ? report.jitter : undefined,
                totalAudioEnergy: report.totalAudioEnergy !== undefined
                    ? report.totalAudioEnergy
                    : undefined,
            };
            jsonReport.personaAudioStream.push(audioData);
        });
    }
    // Build user audio input statistics
    const outboundAudio = ((_c = statsByType['outbound-rtp']) === null || _c === void 0 ? void 0 : _c.filter((r) => r.kind === 'audio')) || [];
    if (outboundAudio.length > 0) {
        jsonReport.userAudioInput = [];
        outboundAudio.forEach((report) => {
            var _a, _b;
            const userAudioData = {
                packetsSent: (_a = report.packetsSent) !== null && _a !== void 0 ? _a : 'unknown',
                retransmittedPackets: (_b = report.retransmittedPacketsSent) !== null && _b !== void 0 ? _b : undefined,
                avgPacketSendDelay: report.totalPacketSendDelay !== undefined
                    ? (report.totalPacketSendDelay / (report.packetsSent || 1)) * 1000
                    : undefined,
            };
            jsonReport.userAudioInput.push(userAudioData);
        });
    }
    // Build codec information
    if (statsByType['codec']) {
        jsonReport.codecs = [];
        statsByType['codec'].forEach((report) => {
            const codecData = {
                status: report.payloadType ? 'Active' : 'Available',
                mimeType: report.mimeType || 'Unknown',
                payloadType: report.payloadType || 'N/A',
                clockRate: report.clockRate || undefined,
                channels: report.channels || undefined,
            };
            jsonReport.codecs.push(codecData);
        });
    }
    // Build transport layer information
    if (statsByType['transport']) {
        jsonReport.transportLayer = [];
        statsByType['transport'].forEach((report) => {
            const transportData = {
                dtlsState: report.dtlsState || 'unknown',
                iceState: report.iceState || 'unknown',
                bytesSent: report.bytesSent || undefined,
                bytesReceived: report.bytesReceived || undefined,
            };
            jsonReport.transportLayer.push(transportData);
        });
    }
    // Build issues summary
    const issues = [];
    // Check for video issues
    inboundVideo.forEach((report) => {
        if (typeof report.framesDropped === 'number' && report.framesDropped > 0) {
            issues.push(`Video: ${report.framesDropped} frames dropped`);
        }
        if (typeof report.packetsLost === 'number' && report.packetsLost > 0) {
            issues.push(`Video: ${report.packetsLost} packets lost`);
        }
        if (typeof report.framesPerSecond === 'number' &&
            report.framesPerSecond < 23) {
            issues.push(`Video: Low frame rate (${report.framesPerSecond} fps)`);
        }
    });
    // Check for audio issues
    inboundAudio.forEach((report) => {
        if (typeof report.packetsLost === 'number' && report.packetsLost > 0) {
            issues.push(`Audio: ${report.packetsLost} packets lost`);
        }
        if (typeof report.jitter === 'number' && report.jitter > 0.1) {
            issues.push(`Audio: High jitter (${(report.jitter * 1000).toFixed(1)}ms)`);
        }
    });
    jsonReport.issues = issues;
    // Return JSON if requested
    if (outputFormat === 'json') {
        return jsonReport;
    }
    // Generate console output from JSON report
    console.group('📊 WebRTC Session Statistics Report');
    // Console output for video stream
    if (jsonReport.personaVideoStream &&
        jsonReport.personaVideoStream.length > 0) {
        console.group('📹 Persona Video Stream (Inbound)');
        jsonReport.personaVideoStream.forEach((videoData) => {
            console.log(`Frames Received: ${videoData.framesReceived}`);
            console.log(`Frames Dropped: ${videoData.framesDropped}`);
            console.log(`Frames Per Second: ${videoData.framesPerSecond}`);
            console.log(`Packets Received: ${typeof videoData.packetsReceived === 'number' ? videoData.packetsReceived.toLocaleString() : videoData.packetsReceived}`);
            console.log(`Packets Lost: ${videoData.packetsLost}`);
            if (videoData.resolution) {
                console.log(`Resolution: ${videoData.resolution}`);
            }
            if (videoData.jitter !== undefined) {
                console.log(`Jitter: ${videoData.jitter.toFixed(5)}ms`);
            }
        });
        console.groupEnd();
    }
    // Console output for audio stream
    if (jsonReport.personaAudioStream &&
        jsonReport.personaAudioStream.length > 0) {
        console.group('🔊 Persona Audio Stream (Inbound)');
        jsonReport.personaAudioStream.forEach((audioData) => {
            console.log(`Packets Received: ${typeof audioData.packetsReceived === 'number' ? audioData.packetsReceived.toLocaleString() : audioData.packetsReceived}`);
            console.log(`Packets Lost: ${audioData.packetsLost}`);
            console.log(`Audio Level: ${audioData.audioLevel}`);
            if (audioData.jitter !== undefined) {
                console.log(`Jitter: ${audioData.jitter.toFixed(5)}ms`);
            }
            if (audioData.totalAudioEnergy !== undefined) {
                console.log(`Total Audio Energy: ${audioData.totalAudioEnergy.toFixed(6)}`);
            }
        });
        console.groupEnd();
    }
    // Console output for user audio input
    if (jsonReport.userAudioInput && jsonReport.userAudioInput.length > 0) {
        console.group('🎤 User Audio Input (Outbound)');
        jsonReport.userAudioInput.forEach((userAudioData) => {
            console.log(`Packets Sent: ${typeof userAudioData.packetsSent === 'number' ? userAudioData.packetsSent.toLocaleString() : userAudioData.packetsSent}`);
            if (userAudioData.retransmittedPackets) {
                console.log(`Retransmitted Packets: ${userAudioData.retransmittedPackets}`);
            }
            if (userAudioData.avgPacketSendDelay !== undefined) {
                console.log(`Avg Packet Send Delay: ${userAudioData.avgPacketSendDelay.toFixed(5)}ms`);
            }
        });
        console.groupEnd();
    }
    // Console output for codecs
    if (jsonReport.codecs && jsonReport.codecs.length > 0) {
        console.group('🔧 Codecs Used');
        jsonReport.codecs.forEach((codecData) => {
            console.log(`${codecData.status} ${codecData.mimeType} - Payload Type: ${codecData.payloadType}`);
            if (codecData.clockRate) {
                console.log(`  Clock Rate: ${codecData.clockRate}Hz`);
            }
            if (codecData.channels) {
                console.log(`  Channels: ${codecData.channels}`);
            }
        });
        console.groupEnd();
    }
    // Console output for transport layer
    if (jsonReport.transportLayer && jsonReport.transportLayer.length > 0) {
        console.group('🚚 Transport Layer');
        jsonReport.transportLayer.forEach((transportData) => {
            console.log(`DTLS State: ${transportData.dtlsState}`);
            console.log(`ICE State: ${transportData.iceState}`);
            if (transportData.bytesReceived || transportData.bytesSent) {
                console.log(`Data Transfer (bytes) - Sent: ${(transportData.bytesSent || 0).toLocaleString()}, Received: ${(transportData.bytesReceived || 0).toLocaleString()}`);
            }
        });
        console.groupEnd();
    }
    // Console output for issues
    if (jsonReport.issues.length > 0) {
        console.group('⚠️ Potential Issues Detected');
        jsonReport.issues.forEach((issue) => console.warn(issue));
        console.groupEnd();
    }
    else {
        console.log('✅ No significant issues detected');
    }
    console.groupEnd();
};
exports.createRTCStatsReport = createRTCStatsReport;
//# sourceMappingURL=ClientMetrics.js.map