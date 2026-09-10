"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicEventEmitter = void 0;
const ClientMetrics_1 = require("../lib/ClientMetrics");
const types_1 = require("../types");
class PublicEventEmitter {
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
        if (event === types_1.AnamEvent.CONNECTION_ESTABLISHED) {
            (0, ClientMetrics_1.sendClientMetric)(ClientMetrics_1.ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_CONNECTION_ESTABLISHED, '1');
        }
        if (event === types_1.AnamEvent.CONNECTION_CLOSED) {
            const [closeCode, details] = args;
            (0, ClientMetrics_1.sendClientMetric)(ClientMetrics_1.ClientMetricMeasurement.CLIENT_METRIC_MEASUREMENT_CONNECTION_CLOSED, closeCode, details ? { details: details } : undefined);
        }
        if (!this.listeners[event])
            return;
        this.listeners[event].forEach((callback) => {
            callback(...args);
        });
    }
}
exports.PublicEventEmitter = PublicEventEmitter;
//# sourceMappingURL=PublicEventEmitter.js.map