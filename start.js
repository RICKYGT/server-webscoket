const express = require('express');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const wss = new WebSocket.Server({ port: 8080 });
const agents = {}; // agent_id -> ws

console.log("WS running :8080");
console.log("HTTP API running :3000");

// ===== WS PART =====
wss.on('connection', (ws) => {
   let agentId = null;

   ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString());

      if (data.type === "HELLO") {
         agentId = data.agent_id;
         agents[agentId] = ws;
         console.log("Agent registered:", agentId);
         return;
      }

      console.log("From agent:", data);
   });

   ws.on('close', () => {
      if (agentId) delete agents[agentId];
      console.log("Agent disconnected:", agentId);
   });
});

// ===== HTTP API PART =====
app.post('/device/:deviceId/:command', (req, res) => {
   const { deviceId, command } = req.params;

   // sementara hardcode mapping
   const deviceMap = {
      device1: { agent_id: "agent-win-01" },
      device2: { agent_id: "agent-win-01" }
   };

   const device = deviceMap[deviceId];
   if (!device) {
      return res.status(404).json({ error: "Device not found" });
   }

   const agentWs = agents[device.agent_id];
   if (!agentWs) {
      return res.status(503).json({ error: "Agent offline" });
   }

   agentWs.send(JSON.stringify({
      type: "HTTP_TRIGGER",
      device_id: deviceId,
      path: command
   }));

   res.json({ status: "SENT", deviceId, command });
});

app.listen(3000);
