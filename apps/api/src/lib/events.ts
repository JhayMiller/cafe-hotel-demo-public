import {Server as SocketServer} from 'socket.io';
import type {Server as HttpServer} from 'node:http';
import {readIdentity, canViewArea} from './auth.js';

let io: SocketServer;
export function installSockets(server: HttpServer) {
  io = new SocketServer(server, {path:'/socket.io', cors:{origin:process.env.WEB_ORIGIN,credentials:true}});
  const staff = io.of('/staff');
  staff.use(async (socket,next) => {
    const cookie = socket.handshake.headers.cookie ?? '';
    const token = cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('ch_session='))?.slice(11);
    const auth = await readIdentity(token ? decodeURIComponent(token) : undefined);
    if (!auth || auth.role==='guest') return next(new Error('Acceso restringido'));
    socket.data.identity = auth;
    next();
  });
  staff.on('connection', socket => {
    const role: string = socket.data.identity.role;
    for (const area of ['cafe','hotel']) if (canViewArea(role,area)) socket.join(area);
  });
}
export function announce(area:string, suborderId:string, status:string) {
  io?.of('/staff').to(area).emit('suborder:update', {area,suborderId,status});
}
