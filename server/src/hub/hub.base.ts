import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ConnectionManager, type HubConnection } from './hub-connection.js';

export interface HubClientProxy<TEvents extends Record<string, unknown>> {
  send<TEvent extends keyof TEvents & string>(event: TEvent, payload: TEvents[TEvent]): void;
}

export abstract class HubBase<TEvents extends Record<string, unknown>>
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  protected server!: Server;
  protected readonly connections = new ConnectionManager();
  protected abstract readonly logger: Logger;

  afterInit(server: Server): void {
    this.server = server;
    this.onHubInitialized(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const connection = this.connections.register(socket);
    this.logger.log(`Connection established: ${connection.connectionId}`);
    try {
      await this.onConnectedAsync(connection);
    } catch (error) {
      this.logger.error(
        `onConnectedAsync failed for ${connection.connectionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const connection = this.connections.get(socket.id);
    if (!connection) {
      return;
    }
    try {
      await this.onDisconnectedAsync(connection);
    } catch (error) {
      this.logger.error(
        `onDisconnectedAsync failed for ${connection.connectionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.connections.unregister(socket.id);
      this.logger.log(`Connection closed: ${socket.id}`);
    }
  }

  protected onHubInitialized(_server: Server): void {}

  protected onConnectedAsync(_connection: HubConnection): Promise<void> | void {}

  protected onDisconnectedAsync(_connection: HubConnection): Promise<void> | void {}

  protected readonly groups = {
    addToGroupAsync: async (connectionId: string, groupName: string): Promise<void> => {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        return;
      }
      await connection.socket.join(groupName);
      connection.groups.add(groupName);
      this.logger.debug(`${connectionId} joined group ${groupName}`);
    },

    removeFromGroupAsync: async (connectionId: string, groupName: string): Promise<void> => {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        return;
      }
      await connection.socket.leave(groupName);
      connection.groups.delete(groupName);
      this.logger.debug(`${connectionId} left group ${groupName}`);
    },
  };

  protected get clients() {
    return {
      client: (connectionId: string): HubClientProxy<TEvents> => ({
        send: (event, payload) => this.server.to(connectionId).emit(event, payload),
      }),
    };
  }
}
