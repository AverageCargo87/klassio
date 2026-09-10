import { InternalEvent, InternalEventCallbacks } from '../types';
export declare class InternalEventEmitter {
    private listeners;
    constructor();
    addListener<K extends InternalEvent>(event: K, callback: InternalEventCallbacks[K]): void;
    removeListener<K extends InternalEvent>(event: K, callback: InternalEventCallbacks[K]): void;
    emit<K extends InternalEvent>(event: K, ...args: InternalEventCallbacks[K] extends (...args: infer P) => any ? P : never): void;
}
//# sourceMappingURL=InternalEventEmitter.d.ts.map