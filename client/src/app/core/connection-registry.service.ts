import { Injectable, computed, signal, type Signal } from '@angular/core';
import type { ConnectionStatus } from './contracts';

@Injectable({ providedIn: 'root' })
export class ConnectionRegistryService {
  private readonly trackedStatuses = signal<Signal<ConnectionStatus>[]>([]);

  readonly overallStatus = computed<ConnectionStatus>(() => {
    const statuses = this.trackedStatuses().map((status) => status());
    if (statuses.length === 0) {
      return 'connecting';
    }
    if (statuses.every((status) => status === 'connected')) {
      return 'connected';
    }
    if (statuses.some((status) => status === 'reconnecting' || status === 'connecting')) {
      return 'reconnecting';
    }
    return 'disconnected';
  });

  register(status: Signal<ConnectionStatus>): () => void {
    this.trackedStatuses.update((tracked) => [...tracked, status]);
    return () =>
      this.trackedStatuses.update((tracked) => tracked.filter((entry) => entry !== status));
  }
}
