const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PEERS = 5;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const peerCount = (r) => r.clients.length + 1;

function makeCode() {
  let c;
  do {
    c = '';
    for (let i = 0; i < 5; i++) c += CHARS[Math.floor(Math.random() * CHARS.length)];
  } while (rooms.has(c));
  return c;
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.seat = -1;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.type === 'create') {
      if (ws.room) return send(ws, { type: 'error', text: 'Kamu sudah di room' });
      const code = makeCode();
      const r = { code, host: ws, clients: [], started: false };
      rooms.set(code, r);
      ws.room = r;
      ws.seat = 0;
      return send(ws, { type: 'created', code });
    }

    if (m.type === 'join') {
      if (ws.room) return send(ws, { type: 'error', text: 'Kamu sudah di room' });
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return send(ws, { type: 'error', text: 'Kode room tidak ditemukan' });
      if (r.started) return send(ws, { type: 'error', text: 'Game sudah berjalan' });
      if (peerCount(r) >= MAX_PEERS) return send(ws, { type: 'error', text: 'Room sudah penuh' });
      r.clients.push(ws);
      ws.room = r;
      ws.seat = r.clients.length;
      send(ws, { type: 'joined', seat: ws.seat });
      send(r.host, { type: 'peer', count: peerCount(r) });
      return;
    }

    const r = ws.room;
    if (!r) return;

    if (m.type === 'snap' && ws === r.host) {
      if (m.html) r.started = true;
      r.clients.forEach((c) => send(c, { type: 'snap', html: m.html, style: m.style }));
      return;
    }

    if (m.type === 'click' && ws !== r.host) {
      send(r.host, { type: 'click', id: String(m.id), seat: ws.seat });
    }
  });

  ws.on('close', () => {
    const r = ws.room;
    if (!r) return;

    if (ws === r.host) {
      r.clients.forEach((c) => { send(c, { type: 'ended' }); c.room = null; });
      rooms.delete(r.code);
      return;
    }

    r.clients = r.clients.filter((c) => c !== ws);
    if (!r.started) {
      r.clients.forEach((c, i) => { c.seat = i + 1; send(c, { type: 'joined', seat: c.seat }); });
    }
    send(r.host, { type: 'peer', count: peerCount(r) });
  });
});

server.listen(PORT, () => console.log(`Ular Tangga berjalan di port ${PORT}`));
