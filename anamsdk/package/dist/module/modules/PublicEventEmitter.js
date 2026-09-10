import { ClientMetricMeasurement, sendClientMetric, } from '../lib/ClientMetrics';
import { AnamEvent } from '../types';
export class PublicEventEmitter {
    constructor() {
        this.listeners = {};
    }
    addListener(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }
        this.listeners[event].add(callback);
    }
    removeListener(event, callback) {
        if (!this.listeners[event])
            return;
        this.listeners[event].delete(callback);
    }
    emit(event, ...args) {
        if (event === AnamEvent.CONNECTION_ESTABLISHED) {
            sendClientMetric(ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_CONNECTION_ESTABLISHED, '1');
        }
        if (event === AnamEvent.CONNECTION_CLOSED) {
            const [closeCode, details] = args;
            sendClientMetric(ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_CONNECTION_CLOSED, closeCode, details ? { details: details } : undefined);
        }
        if (!this.listeners[event])
            return;
        this.listeners[event].forEach((callback) => {
            callback(...args);
        });
    }
}
//# sourceMappingURL=PublicEventEmitter.js.map