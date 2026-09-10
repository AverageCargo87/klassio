import { AnamEvent, EventCallbacks } from '../types';
export declare class PublicEventEmitter {
    private listeners;
    constructor();
    addListener<K extends AnamEvent>(event: K, callback: EventCallbacks[K]): void;
    removeListener<K extends AnamEvent>(event: K, callback: EventCallbacks[K]): void;
    emit<K extends AnamEvent>(event: K, ...args: EventCallbacks[K] extends (...args: infer P) => any ? P : never): void;
}
//# sourceMappingURL=PublicEventEmitter.d.ts.map