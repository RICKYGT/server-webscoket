require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuid } = require('uuid');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);

// ===== AUTH =====
const PORT = process.env.PORT || 4000;
const SECRET_KEY = process.env.SECRET_KEY || 'changeme-secret-key';

io.use((socket, next) => {
   const token = socket.handshake.auth?.token;
   if (token !== SECRET_KEY) {
      console.warn(`[auth] rejected socket ${socket.id} — invalid token`);
      return next(new Error('Unauthorized'));
   }
   next();
});

// ===== STATE =====
const offices = {}; // office_id -> socket[]
const queues = {}; // office_id -> { pending: [], currentJob: null }

// ===== QUEUE =====
function getQueue(office_id) {
   if (!queues[office_id]) {
      queues[office_id] = { pending: [], currentJob: null };
   }
   return queues[office_id];
}

function enqueue(office_id, payload) {
   return new Promise((resolve, reject) => {
      const job = { id: uuid(), payload, resolve, reject, timer: null };
      const q = getQueue(office_id);
      q.pending.push(job);

      if (!q.currentJob) {
         processNext(office_id);
      }
   });
}

function processNext(office_id) {
   const q = queues[office_id];
   if (!q || q.pending.length === 0) {
      if (q) q.currentJob = null;
      return;
   }

   const job = q.pending.shift();
   q.currentJob = job;

   const clients = offices[office_id];
   if (!clients || clients.length === 0) {
      job.reject(new Error('Office offline'));
      q.currentJob = null;
      processNext(office_id);
      return;
   }

   // Timeout 30 detik per job
   job.timer = setTimeout(() => {
      if (q.currentJob?.id === job.id) {
         q.currentJob = null;
         job.reject(new Error('Timeout'));
         processNext(office_id);
      }
   }, 30_000);

   clients.forEach(socket => {
      socket.emit('HTTP_TRIGGER', {
         job_id: job.id,
         ...job.payload
      });
   });

   console.log(`[queue] office=${office_id} job=${job.id} sent | pending=${q.pending.length}`);
}

// ===== SOCKET.IO HANDLER =====
io.on('connection', (socket) => {
   let officeId = null;

   socket.on('HELLO', (data) => {
      officeId = data.office_id;

      if (!offices[officeId]) offices[officeId] = [];
      offices[officeId].push(socket);

      console.log(`Agent online: office_id=${officeId} | total=${offices[officeId].length}`);
   });

   socket.on('RESULT', (data) => {
      const q = queues[officeId];

      if (q?.currentJob && q.currentJob.id === data.job_id) {
         clearTimeout(q.currentJob.timer);
         q.currentJob.resolve(data.result ?? data);
         q.currentJob = null;
         processNext(officeId);
      } else {
         console.warn(`[queue] RESULT job_id=${data.job_id} tidak cocok atau sudah timeout`);
      }
   });

   socket.on('disconnect', () => {
      if (officeId && offices[officeId]) {
         offices[officeId] = offices[officeId].filter(s => s !== socket);
         if (offices[officeId].length === 0) delete offices[officeId];
      }
      console.log('Agent offline:', officeId);
   });
});

// ===== REST API =====

// TRIGGER DEVICE (queue per office_id)
app.get('/:office_id/:device_id/:device_ip/:command', async (req, res) => {

   const { office_id, device_id, device_ip, command } = req.params;
   const query = req.query;
   const rig_id = req.query.rig_id || 'default_rig';

   if (!offices[office_id] || offices[office_id].length === 0) {
      return res.status(503).json({ error: 'Office offline' });
   }

   try {
      const result = await enqueue(office_id, {
         device: { office_id, rig_id, device_id, device_ip, path: command, query }
      });

      res.json({
         status: 'DONE',
         device_id,
         command,
         query,
         result,
         at: new Date().toISOString()
      });
   } catch (err) {
      res.status(503).json({ error: err.message });
   }
});

// STATUS SERVER (websocket running + office yang connect)
app.get('/status', (req, res) => {
   const officeList = Object.entries(offices).map(([office_id, clients]) => ({
      office_id,
      connected: clients.length,
      socket_ids: clients.map(s => s.id)
   }));

   res.json({
      status: 'running',
      uptime_seconds: Math.floor(process.uptime()),
      started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      offices_online: Object.keys(offices),
      offices: officeList
   });
});

// STATUS QUEUE
app.get('/queue/status', (req, res) => {
   const status = {};
   for (const [office_id, q] of Object.entries(queues)) {
      status[office_id] = {
         active: q.currentJob ? q.currentJob.id : null,
         pending: q.pending.length
      };
   }
   res.json(status);
});

server.listen(PORT, () => {
   console.log(`Server running :${PORT} (REST + Socket.IO)`);
});
