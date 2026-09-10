import { ApiGatewayConfig } from '../types/ApiGatewayConfig';
export declare const DEFAULT_ANAM_METRICS_BASE_URL = "https://api.anam.ai";
export declare const DEFAULT_ANAM_API_VERSION = "/v1";
export declare enum ClientMetricMeasurement {
    CLIENT_METRIC_MEASUREMENT_ERROR = "client_error",
    CLIENT_METRIC_MEASUREMENT_CONNECTION_CLOSED = "client_connection_closed",
    CLIENT_METRIC_MEASUREMENT_CONNECTION_ESTABLISHED = "client_connection_established",
    CLIENT_METRIC_MEASUREMENT_CONNECTION_MILESTONE = "client_connection_milestone",
    CLIENT_METRIC_MEASUREMENT_CONNECTION_MILESTONES = "client_connection_milestones",
    CLIENT_METRIC_MEASUREMENT_SESSION_ATTEMPT = "client_session_attempt",
    CLIENT_METRIC_MEASUREMENT_SESSION_SUCCESS = "client_session_success",
    CLIENT_METRIC_MEASUREMENT_ICE_RESTART = "client_ice_restart"
}
export declare const setClientMetricsBaseUrl: (baseUrl: string, apiVersion?: string) => void;
export declare const setClientMetricsApiGateway: (config: ApiGatewayConfig | undefined) => void;
export declare const setClientMetricsDisabled: (disabled: boolean) => void;
export interface AnamMetricsContext {
    sessionId: string | null;
    organizationId: string | null;
    attemptCorrelationId: string | null;
}
export declare const setMetricsContext: (context: Partial<AnamMetricsContext>) => void;
export interface ClientMetricPayload {
    name: string;
    value: string | number;
    clientTimestamp?: string;
    tags?: Record<string, string | number>;
}
export declare const sendClientMetric: (name: string, value: string | number, tags?: Record<string, string | number>) => Promise<void>;
export declare const sendClientMetrics: (metrics: ClientMetricPayload[]) => Promise<void>;
export interface RTCStatsJsonReport {
    personaVideoStream?: {
        framesReceived: number | string;
        framesDropped: number | string;
        framesPerSecond: number | string;
        packetsReceived: number | string;
        packetsLost: number | string;
        resolution?: string;
        jitter?: number;
    }[];
    personaAudioStream?: {
        packetsReceived: number | string;
        packetsLost: number | string;
        audioLevel: number | string;
        jitter?: number;
        totalAudioEnergy?: number;
    }[];
    userAudioInput?: {
        packetsSent: number | string;
        retransmittedPackets?: number;
        avgPacketSendDelay?: number;
    }[];
    codecs?: {
        status: string;
        mimeType: string;
        payloadType: string | number;
        clockRate?: number;
        channels?: number;
    }[];
    transportLayer?: {
        dtlsState: string;
        iceState: string;
        bytesSent?: number;
        bytesReceived?: number;
    }[];
    issues: string[];
}
export declare const createRTCStatsReport: (stats: RTCStatsReport, outputFormat?: 'console' | 'json') => RTCStatsJsonReport | void;
//# sourceMappingURL=ClientMetrics.d.ts.map