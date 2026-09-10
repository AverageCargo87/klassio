"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalEventEmitter = void 0;
class InternalEventEmitter {
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
        if (!this.listeners[event])
            return;
        this.listeners[event].forEach((callback) => {
            callback(...args);
        });
    }
}
exports.InternalEventEmitter = InternalEventEmitter;
//# sourceMappingURL=InternalEventEmitter.js.map