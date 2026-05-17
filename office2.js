const WebSocket = require('ws');
const axios = require('axios');

const office_id = "2";
const office_name = "Office 2";
const WS_URL = "ws://192.168.1.66:3000";

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
      office_id: office_id,
      office_name: office_name,
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

   const job_id = data.job_id;
   const device = data.device;
   const { rig_id, device_id, device_ip } = device;

   const path = device.path || device.command;
   const query = device.query || {};

   const queryString = new URLSearchParams(query).toString();
   const url = queryString
      ? `http://${device_ip}/${path}?${queryString}`
      : `http://${device_ip}/${path}`;

   console.log("📡 Triggering Android device");
   console.log("📱 Device ID:", device_id);
   console.log("🌐 URL:", url);

   try {
      const response = await axios.post(url, {}, { timeout: 5000 });

      console.log("✅ HTTP SUCCESS");
      console.log("📨 Status:", response.status);

      ws.send(JSON.stringify({
         type: "RESULT",
         job_id,
         office_id: office_id,
         office_name: office_name,
         device_id,
         status: "SUCCESS",
         http_status: response.status
      }));

   } catch (err) {
      console.error("❌ HTTP FAILED");
      console.error("💥 Error:", err.message);

      ws.send(JSON.stringify({
         type: "RESULT",
         job_id,
         office_id: office_id,
         office_name: office_name,
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
