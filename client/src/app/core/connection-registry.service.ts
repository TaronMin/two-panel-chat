import { Injectable, computed, signal, type Signal } from '@angular/core';
import type { ConnectionStatus } from './contracts';

@Injectable({ providedIn: 'root' })
export class ConnectionRegistryService {
  private readonly sockets = signal<Signal<ConnectionStatus>[]>([]);

  readonly overall = computed<ConnectionStatus>(() => {
    const statuses = this.sockets().map((status) => status());
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
    this.sockets.update((all) => [...all, status]);
    return () => this.sockets.update((all) => all.filter((entry) => entry !== status));
  }
}
