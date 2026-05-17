const express = require('express');
const WebSocket = require('ws');
const { v4: uuid } = require('uuid');

const app = express();
app.use(express.json());

// ===== WS =====
const wss = new WebSocket.Server({ port: 3000 });
const offices = {}; // office_id -> ws[]
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

   clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
         client.send(JSON.stringify({
            type: 'HTTP_TRIGGER',
            job_id: job.id,
            ...job.payload
         }));
      }
   });

   console.log(`[queue] office=${office_id} job=${job.id} sent | pending=${q.pending.length}`);
}

// ===== WS HANDLER =====
wss.on('connection', (ws) => {
   let officeId = null;

   ws.on('message', async (msg) => {
      const data = JSON.parse(msg.toString());

      if (data.type === 'HELLO') {
         officeId = data.office_id;

         if (!offices[officeId]) offices[officeId] = [];
         offices[officeId].push(ws);

         console.log(`Agent online: office_id=${officeId} | total=${offices[officeId].length}`);
      }

      if (data.type === 'RESULT') {
         const q = queues[officeId];

         if (q?.currentJob && q.currentJob.id === data.job_id) {
            clearTimeout(q.currentJob.timer);
            q.currentJob.resolve(data.result ?? data);
            q.currentJob = null;
            processNext(officeId);
         } else {
            console.warn(`[queue] RESULT job_id=${data.job_id} tidak cocok atau sudah timeout`);
         }
      }
   });

   ws.on('close', () => {
      if (officeId && offices[officeId]) {
         offices[officeId] = offices[officeId].filter(c => c !== ws);
         if (offices[officeId].length === 0) delete offices[officeId];
      }
      console.log('Agent offline:', officeId);
   });
});

// ===== REST API =====

// TRIGGER DEVICE (queue per office_id)
app.get('/:office_id/:device_id/:device_ip/:command', async (req, res) => {
   const rig_id = req.query.rig_id || 'default_rig';

   const { office_id, rig_id, device_id, device_ip, command } = req.params;
   const query = req.query;

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

app.listen(4000, () => {
   console.log('REST API running :4000');
});
