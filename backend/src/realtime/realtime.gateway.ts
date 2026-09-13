import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Gateway WebSocket principal de Fluxo.
 *
 * Fonctionnalités :
 * - Authentification par JWT à la connexion
 * - Salles par projet (room = projectId) pour le fil d'activité live
 * - Présence : online / offline diffusée aux contacts
 * - Typing indicators pour la messagerie (Phase future)
 * - Notifications push en temps réel
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:4200',
    credentials: true,
  },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /** userId → Set<socketId> pour gérer la présence multi-onglets */
  private userSockets = new Map<string, Set<string>>();

  constructor(private jwtService: JwtService) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string) ??
        (socket.handshake.headers['authorization'] as string)?.replace('Bearer ', '');

      if (!token) {
        socket.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      }) as { sub: string; scope: string };

      if (payload.scope !== 'full') {
        socket.disconnect();
        return;
      }

      // Attacher userId au socket
      (socket as any).userId = payload.sub;

      // Rejoindre la salle personnelle (notifications)
      socket.join(`user:${payload.sub}`);

      // Gérer la présence
      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(socket.id);

      // Diffuser la présence (si c'est le premier onglet)
      if (this.userSockets.get(payload.sub)!.size === 1) {
        this.server.emit('presence:online', { userId: payload.sub });
      }

      this.logger.debug(`User ${payload.sub} connected (${socket.id})`);
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const userId = (socket as any).userId as string | undefined;
    if (!userId) return;

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        this.server.emit('presence:offline', { userId });
        this.logger.debug(`User ${userId} offline`);
      }
    }
  }

  /** Rejoindre la salle d'un projet pour recevoir les événements live */
  @SubscribeMessage('project:join')
  handleJoinProject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    socket.join(`project:${data.projectId}`);
    return { joined: data.projectId };
  }

  /** Quitter la salle d'un projet */
  @SubscribeMessage('project:leave')
  handleLeaveProject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    socket.leave(`project:${data.projectId}`);
    return { left: data.projectId };
  }

  /** Rejoindre un channel de messagerie */
  @SubscribeMessage('channel:join')
  handleJoinChannel(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    socket.join(`channel:${data.channelId}`);
    return { joined: data.channelId };
  }

  // ── WebRTC Signalisation ─────────────────────────────────────────────────

  /** Un participant rejoint une salle d'appel */
  @SubscribeMessage('call:join')
  handleCallJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { room: string },
  ) {
    socket.join(`call:${data.room}`);
    this.logger.debug(`User joined call room: ${data.room}`);
    return { joined: data.room };
  }

  /** Offre SDP WebRTC (initiateur → participant) */
  @SubscribeMessage('call:offer')
  handleCallOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { room: string; offer: RTCSessionDescriptionInit },
  ) {
    socket.to(`call:${data.room}`).emit('call:offer', {
      offer: data.offer,
      room: data.room,
      from: (socket as any).userId,
    });
  }

  /** Réponse SDP WebRTC (participant → initiateur) */
  @SubscribeMessage('call:answer')
  handleCallAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { room: string; answer: RTCSessionDescriptionInit },
  ) {
    socket.to(`call:${data.room}`).emit('call:answer', {
      answer: data.answer,
      room: data.room,
      from: (socket as any).userId,
    });
  }

  /** ICE Candidates */
  @SubscribeMessage('call:ice')
  handleCallIce(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { room: string; candidate: RTCIceCandidateInit },
  ) {
    socket.to(`call:${data.room}`).emit('call:ice', {
      candidate: data.candidate,
      room: data.room,
    });
  }

  /** Fin d'appel */
  @SubscribeMessage('call:end')
  handleCallEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { room: string },
  ) {
    socket.to(`call:${data.room}`).emit('call:ended', { room: data.room });
    socket.leave(`call:${data.room}`);
    this.logger.debug(`Call ended in room: ${data.room}`);
  }

  /** Indicateur "en train d'écrire" */
  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    const userId = (socket as any).userId;
    socket.to(`channel:${data.channelId}`).emit('typing:start', { userId, channelId: data.channelId });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    const userId = (socket as any).userId;
    socket.to(`channel:${data.channelId}`).emit('typing:stop', { userId, channelId: data.channelId });
  }

  // ── Méthodes utilitaires appelées par d'autres services ──────────────────

  /** Envoyer une notification à un utilisateur spécifique */
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /** Diffuser un événement dans la salle d'un projet */
  emitToProject(projectId: string, event: string, data: unknown) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }

  /** Diffuser un événement dans un channel de messagerie */
  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  /** Vérifier si un utilisateur est en ligne */
  isOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }
}
