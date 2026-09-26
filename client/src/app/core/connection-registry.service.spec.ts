import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConnectionRegistryService } from './connection-registry.service';
import type { ConnectionStatus } from './contracts';

describe('ConnectionRegistryService', () => {
  let registry: ConnectionRegistryService;

  beforeEach(() => {
    registry = TestBed.inject(ConnectionRegistryService);
  });

  it('reports connecting before any socket registers', () => {
    expect(registry.overallStatus()).toBe('connecting');
  });

  it('reports connected only when every socket is connected', () => {
    registry.register(signal<ConnectionStatus>('connected'));
    registry.register(signal<ConnectionStatus>('connected'));

    expect(registry.overallStatus()).toBe('connected');
  });

  it('reports reconnecting when any socket is still coming up', () => {
    registry.register(signal<ConnectionStatus>('connected'));
    registry.register(signal<ConnectionStatus>('reconnecting'));

    expect(registry.overallStatus()).toBe('reconnecting');
  });

  it('treats a connecting socket alongside a connected one as reconnecting', () => {
    registry.register(signal<ConnectionStatus>('connected'));
    registry.register(signal<ConnectionStatus>('connecting'));

    expect(registry.overallStatus()).toBe('reconnecting');
  });

  it('reports disconnected when nothing is up or coming up', () => {
    registry.register(signal<ConnectionStatus>('disconnected'));
    registry.register(signal<ConnectionStatus>('disconnected'));

    expect(registry.overallStatus()).toBe('disconnected');
  });

  it('tracks a registered signal as it changes', () => {
    const status = signal<ConnectionStatus>('connecting');
    registry.register(status);
    expect(registry.overallStatus()).toBe('reconnecting');

    status.set('connected');
    expect(registry.overallStatus()).toBe('connected');

    status.set('disconnected');
    expect(registry.overallStatus()).toBe('disconnected');
  });

  it('stops counting a socket once its unregister callback runs', () => {
    registry.register(signal<ConnectionStatus>('connected'));
    const unregister = registry.register(signal<ConnectionStatus>('disconnected'));

    expect(registry.overallStatus()).toBe('disconnected');

    unregister();

    expect(registry.overallStatus()).toBe('connected');
  });

  it('returns to connecting when the last socket unregisters', () => {
    const unregister = registry.register(signal<ConnectionStatus>('connected'));

    unregister();

    expect(registry.overallStatus()).toBe('connecting');
  });
});
