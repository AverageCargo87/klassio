import { ClientMetricMeasurement, sendClientMetrics, } from './ClientMetrics';
export const DEFAULT_CONNECTION_MILESTONE_SAMPLE_RATIO = 0;
export const DEFAULT_SLOW_CONNECTION_THRESHOLD_MS = 5000;
export class ClientConnectionMilestoneRecorder {
    constructor(options = {}) {
        var _a, _b, _c, _d;
        this.milestones = [];
        this.context = {
            sessionId: null,
            organizationId: null,
            attemptCorrelationId: null,
        };
        this.published = false;
        this.sessionSuccessful = false;
        this.now = (_a = options.now) !== null && _a !== void 0 ? _a : getMonotonicNow;
        this.attemptStartedAtMs = this.now();
        this.sampleRatio = clampRatio((_b = options.connectionMilestoneSampleRatio) !== null && _b !== void 0 ? _b : DEFAULT_CONNECTION_MILESTONE_SAMPLE_RATIO);
        this.slowConnectionThresholdMs = Math.max(0, finiteNumberOrDefault(options.slowConnectionThresholdMs, DEFAULT_SLOW_CONNECTION_THRESHOLD_MS));
        this.sampled = ((_c = options.random) !== null && _c !== void 0 ? _c : Math.random)() < this.sampleRatio;
        this.updateContext((_d = options.context) !== null && _d !== void 0 ? _d : {});
        this.record('client_session_attempt');
    }
    updateContext(context) {
        this.context = Object.assign(Object.assign({}, this.context), context);
    }
    record(name, tags) {
        if (this.published) {
            return;
        }
        const sanitizedTags = sanitizeMilestoneTags(tags);
        const milestone = {
            name,
            elapsedMs: this.elapsedMs(),
            clientTimestamp: new Date().toISOString(),
        };
        if (Object.keys(sanitizedTags).length > 0) {
            milestone.tags = sanitizedTags;
        }
        this.milestones.push(milestone);
    }
    recordSessionSuccess(tags) {
        if (this.sessionSuccessful) {
            return;
        }
        this.sessionSuccessful = true;
        this.record('client_session_success', tags);
        this.publishIfNeeded();
        // Once the success/publish decision has been made the recorder is done.
        // Stop accumulating and release the buffer for the rest of the
        // (potentially long-lived) session. Without this, a fast unsampled success
        // — the default path, since connectionMilestoneSampleRatio defaults to 0 —
        // never sets `published`, so the long-lived ICE/websocket event handlers
        // keep appending to `milestones` for the entire call.
        this.finalize();
    }
    /**
     * Make the recorder inert and release its buffer. `published` gates
     * record()/publish()/publishFailure(), so flipping it here stops all further
     * recording and publishing. publish() (if it ran) already built the metric
     * payloads synchronously, so clearing the buffer afterwards is safe.
     */
    finalize() {
        this.published = true;
        this.milestones.length = 0;
    }
    publishFailure(tags) {
        if (this.sessionSuccessful || this.published) {
            return;
        }
        this.record('connection_attempt_failed', tags);
        this.publish('failed', tags);
    }
    publishIfNeeded() {
        if (this.published) {
            return;
        }
        if (this.elapsedMs() >= this.slowConnectionThresholdMs) {
            this.publish('slow');
            return;
        }
        if (this.sampled) {
            this.publish('sampled');
        }
    }
    publish(reason, tags) {
        if (this.published || this.milestones.length === 0) {
            return;
        }
        this.published = true;
        const summaryTags = sanitizeMetricTags(Object.assign(Object.assign(Object.assign({}, tags), this.context), { publishReason: reason, attemptDurationMs: this.elapsedMs(), milestoneCount: this.milestones.length, connectionMilestoneSampleRatio: this.sampleRatio, slowConnectionThresholdMs: this.slowConnectionThresholdMs, wasSampled: this.sampled ? 1 : 0 }));
        const metrics = [
            {
                name: ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_CONNECTION_MILESTONES,
                value: '1',
                tags: summaryTags,
            },
            ...this.milestones.map((milestone, index) => ({
                name: ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_CONNECTION_MILESTONE,
                value: milestone.elapsedMs,
                clientTimestamp: milestone.clientTimestamp,
                tags: sanitizeMetricTags(Object.assign(Object.assign(Object.assign({}, this.context), { publishReason: reason, milestone: milestone.name, sequence: index }), milestone.tags)),
            })),
        ];
        void sendClientMetrics(metrics);
    }
    elapsedMs() {
        return Math.max(0, Math.round(this.now() - this.attemptStartedAtMs));
    }
}
const getMonotonicNow = () => {
    if (typeof performance !== 'undefined') {
        return performance.now();
    }
    return Date.now();
};
const clampRatio = (value) => {
    const finiteValue = finiteNumberOrDefault(value, DEFAULT_CONNECTION_MILESTONE_SAMPLE_RATIO);
    return Math.min(1, Math.max(0, finiteValue));
};
const finiteNumberOrDefault = (value, fallback) => {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};
const sanitizeMilestoneTags = (tags) => {
    if (!tags) {
        return {};
    }
    const sanitizedTags = {};
    Object.entries(tags).forEach(([key, value]) => {
        if (value === undefined || value === null) {
            return;
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            return;
        }
        sanitizedTags[key] = value;
    });
    return sanitizedTags;
};
const sanitizeMetricTags = (tags) => {
    const metricTags = {};
    Object.entries(sanitizeMilestoneTags(tags)).forEach(([key, value]) => {
        metricTags[key] = typeof value === 'boolean' ? String(value) : value;
    });
    return metricTags;
};
//# sourceMappingURL=ConnectionMilestones.js.map