import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

export function initSocketHandlers(io: Server) {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Missing token'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string;
    socket.join(userId); // room keyed by userId
    console.log(`Socket connected: user=${userId}`);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: user=${userId}`);
    });
  });
}
