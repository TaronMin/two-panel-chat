import type { Socket } from 'socket.io';

export interface HubConnection {
  readonly connectionId: string;
  readonly socket: Socket;
  readonly groups: Set<string>;
}

export class ConnectionManager {
  private readonly connections = new Map<string, HubConnection>();

  register(socket: Socket): HubConnection {
    const connection: HubConnection = {
      connectionId: socket.id,
      socket,
      groups: new Set<string>(),
    };
    this.connections.set(socket.id, connection);
    return connection;
  }

  unregister(connectionId: string): HubConnection | undefined {
    const connection = this.connections.get(connectionId);
    this.connections.delete(connectionId);
    return connection;
  }

  get(connectionId: string): HubConnection | undefined {
    return this.connections.get(connectionId);
  }
}
