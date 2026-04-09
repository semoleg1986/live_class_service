import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

import { AccessTokenVerifierPort } from '../../application/ports/access-token-verifier.port';

@WebSocketGateway({
  namespace: '/ws/live',
  cors: {
    origin: '*',
  },
})
export class LiveRoomGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    @Inject('ACCESS_TOKEN_VERIFIER')
    private readonly verifier: AccessTokenVerifierPort,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const rawToken =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization as string | undefined);

    if (!rawToken) {
      client.emit('error', {
        code: 'token_required',
        message: 'Для signaling требуется access token.',
      });
      client.disconnect();
      return;
    }

    const token = rawToken.startsWith('Bearer ')
      ? rawToken.slice('Bearer '.length).trim()
      : rawToken.trim();
    if (!token) {
      client.emit('error', {
        code: 'token_invalid',
        message: 'Некорректный access token.',
      });
      client.disconnect();
      return;
    }

    try {
      await this.verifier.verifyAccessToken(token);
    } catch {
      client.emit('error', {
        code: 'token_invalid',
        message: 'Некорректный access token.',
      });
      client.disconnect();
      return;
    }

    const maxParticipants = this.configService.get<number>(
      'liveClass.maxParticipants',
      11,
    );
    client.emit('signaling.ready', { maxParticipants });
  }

  @SubscribeMessage('room.join')
  onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): void {
    if (!payload?.roomId) {
      client.emit('error', {
        code: 'room_id_required',
        message: 'roomId обязателен.',
      });
      return;
    }

    client.join(payload.roomId);
    client.emit('room.joined', { roomId: payload.roomId });
  }

  @SubscribeMessage('webrtc.signal')
  onWebrtcSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      roomId: string;
      kind: 'offer' | 'answer' | 'ice';
      targetPeerId?: string;
      data: Record<string, unknown>;
    },
  ): void {
    if (!payload?.roomId || !payload?.kind || !payload?.data) {
      client.emit('error', {
        code: 'invalid_signal_payload',
        message: 'Невалидный signaling payload.',
      });
      return;
    }

    client.to(payload.roomId).emit('webrtc.signal', {
      fromPeerId: client.id,
      ...payload,
    });
  }
}
