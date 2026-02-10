const express = require('express');
const WebSocket = require('ws');
const { createClient } = require('redis');
const { v4: uuid } = require('uuid');

const app = express();
app.use(express.json());

// ===== REDIS =====
const redis = createClient();
redis.connect();

// ===== WS =====
const wss = new WebSocket.Server({ port: 8080 });
const agents = {}; // agent_id -> ws

// ===== WS HANDLER =====
wss.on('connection', (ws) => {
   let agentId = null;

   ws.on('message', async (msg) => {
      const data = JSON.parse(msg.toString());

      // Register agent
      if (data.type === "HELLO") {
         agentId = data.agent_id;
         agents[agentId] = ws;
         console.log("Agent online:", agentId);
         return;
      }

      // Result dari agent
      if (data.type === "RESULT") {
         console.log("Result:", data);
      }
   });

   ws.on('close', () => {
      if (agentId) delete agents[agentId];
      console.log("Agent offline:", agentId);
   });
});

// ===== REST API =====

// CREATE DEVICE
app.post('/devices', async (req, res) => {
   const id = req.body.device_id || uuid();

   const device = {
      device_id: id,
      agent_id: req.body.agent_id,
      ip: req.body.ip,
      port: req.body.port || 8080,
      status: "idle"
   };

   await redis.set(`device:${id}`, JSON.stringify(device));
   res.json(device);
});

// GET ALL DEVICES
app.get('/devices', async (req, res) => {
   const keys = await redis.keys('device:*');
   const devices = [];

   for (const key of keys) {
      devices.push(JSON.parse(await redis.get(key)));
   }

   res.json(devices);
});

// GET DEVICE
app.get('/devices/:id', async (req, res) => {
   const data = await redis.get(`device:${req.params.id}`);
   if (!data) return res.status(404).json({ error: "Not found" });

   res.json(JSON.parse(data));
});

// UPDATE DEVICE
app.put('/devices/:id', async (req, res) => {
   const key = `device:${req.params.id}`;
   const data = await redis.get(key);
   if (!data) return res.status(404).json({ error: "Not found" });

   const device = {
      ...JSON.parse(data),
      ...req.body
   };

   await redis.set(key, JSON.stringify(device));
   res.json(device);
});

// DELETE DEVICE
app.delete('/devices/:id', async (req, res) => {
   await redis.del(`device:${req.params.id}`);
   res.json({ status: "deleted" });
});

// TRIGGER DEVICE
app.post('/device/:id/:command', async (req, res) => {
   const data = await redis.get(`device:${req.params.id}`);
   if (!data) return res.status(404).json({ error: "Device not found" });

   const device = JSON.parse(data);
   const agentWs = agents[device.agent_id];

   if (!agentWs) {
      return res.status(503).json({ error: "Agent offline" });
   }

   agentWs.send(JSON.stringify({
      type: "HTTP_TRIGGER",
      device
   }));

   res.json({ status: "SENT", device_id: device.device_id });
});

app.listen(3000, () => {
   console.log("REST API running :3000");
});
