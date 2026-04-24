import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { initSocketHandlers } from './socket/handlers';
import authRouter from './routes/auth';
import graphRouter from './routes/graph';
import sourcesRouter from './routes/sources';
import nodesRouter from './routes/nodes';
import edgesRouter from './routes/edges';
import agentRouter from './routes/agent';
import reviewRouter from './routes/review';

export const app = express();
export const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use('/auth', authRouter);
app.use('/graph', graphRouter);
app.use('/sources', sourcesRouter);
app.use('/nodes', nodesRouter);
app.use('/edges', edgesRouter);
app.use('/agent', agentRouter);
app.use('/review', reviewRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

initSocketHandlers(io);
