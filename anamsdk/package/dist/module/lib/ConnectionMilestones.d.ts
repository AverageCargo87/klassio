import { AnamMetricsContext } from './ClientMetrics';
import { ConnectionMilestoneMetricsOptions } from '../types/ConnectionMilestoneMetricsOptions';
export declare const DEFAULT_CONNECTION_MILESTONE_SAMPLE_RATIO = 0;
export declare const DEFAULT_SLOW_CONNECTION_THRESHOLD_MS = 5000;
type ConnectionMilestoneTagValue = string | number | boolean;
type ConnectionMilestoneTags = Record<string, ConnectionMilestoneTagValue | null | undefined>;
interface ClientConnectionMilestoneRecorderOptions extends ConnectionMilestoneMetricsOptions {
    context?: Partial<AnamMetricsContext>;
    now?: () => number;
    random?: () => number;
}
export declare class ClientConnectionMilestoneRecorder {
    private readonly now;
    private readonly attemptStartedAtMs;
    private readonly sampleRatio;
    private readonly slowConnectionThresholdMs;
    private readonly sampled;
    private readonly milestones;
    private context;
    private published;
    private sessionSuccessful;
    constructor(options?: ClientConnectionMilestoneRecorderOptions);
    updateContext(context: Partial<AnamMetricsContext>): void;
    record(name: string, tags?: ConnectionMilestoneTags): void;
    recordSessionSuccess(tags?: ConnectionMilestoneTags): void;
    /**
     * Make the recorder inert and release its buffer. `published` gates
     * record()/publish()/publishFailure(), so flipping it here stops all further
     * recording and publishing. publish() (if it ran) already built the metric
     * payloads synchronously, so clearing the buffer afterwards is safe.
     */
    private finalize;
    publishFailure(tags?: ConnectionMilestoneTags): void;
    publishIfNeeded(): void;
    private publish;
    private elapsedMs;
}
export {};
//# sourceMappingURL=ConnectionMilestones.d.ts.map