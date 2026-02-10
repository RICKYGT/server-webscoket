const WebSocket = require('ws');
const axios = require('axios');

const AGENT_ID = "agent-win-01";
const WS_URL = "ws://192.168.1.8:8080";

console.log("🚀 Starting PC Agent...");
console.log("🔌 Connecting to:", WS_URL);

const ws = new WebSocket(WS_URL);

/**
 * CONNECTED
 */
ws.on('open', () => {
   console.log("✅ WebSocket connected");

   const helloPayload = {
      type: "HELLO",
      agent_id: AGENT_ID,
      platform: "windows",
      version: "1.0.0"
   };

   console.log("📤 Sending HELLO:", helloPayload);
   ws.send(JSON.stringify(helloPayload));
});

/**
 * MESSAGE FROM SERVER
 */
ws.on('message', async (msg) => {
   console.log("📥 Raw message:", msg.toString());

   let data;
   try {
      data = JSON.parse(msg.toString());
   } catch (err) {
      console.error("❌ Invalid JSON from server");
      return;
   }

   console.log("📦 Parsed data:", data);

   if (data.type !== "HTTP_TRIGGER") {
      console.log("⚠️ Unknown message type:", data.type);
      return;
   }

   const device = data.device;
   const { device_id, ip, port } = device;

   const path = device.path || device.command;
   const query = device.query || {};

   const queryString = new URLSearchParams(query).toString();
   const url = queryString
      ? `http://${ip}:${port}/${path}?${queryString}`
      : `http://${ip}:${port}/${path}`;

   console.log("📡 Triggering Android device");
   console.log("📱 Device ID:", device_id);
   console.log("🌐 URL:", url);

   try {
      const response = await axios.post(url, {}, { timeout: 5000 });

      console.log("✅ HTTP SUCCESS");
      console.log("📨 Status:", response.status);

      ws.send(JSON.stringify({
         type: "RESULT",
         agent_id: AGENT_ID,
         device_id,
         status: "SUCCESS",
         http_status: response.status
      }));

   } catch (err) {
      console.error("❌ HTTP FAILED");
      console.error("💥 Error:", err.message);

      ws.send(JSON.stringify({
         type: "RESULT",
         agent_id: AGENT_ID,
         device_id,
         status: "FAILED",
         error: err.message
      }));
   }
});

/**
 * ERROR
 */
ws.on('error', (err) => {
   console.error("🔥 WebSocket error:", err.message);
});

/**
 * DISCONNECTED
 */
ws.on('close', () => {
   console.warn("🔌 WebSocket disconnected");
});
