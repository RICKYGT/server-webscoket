require('dotenv').config();

const { io } = require('socket.io-client');
const axios = require('axios');

const office_id = process.env.OFFICE_ID || "1";
const office_name = process.env.OFFICE_NAME || "Office 1";
const WS_URL = process.env.WS_URL || "http://192.168.1.66:4000";
const SECRET_KEY = process.env.SECRET_KEY || "changeme-secret-key";

console.log("🚀 Starting PC Agent...");
console.log("🔌 Connecting to:", WS_URL);

const socket = io(WS_URL, {
   auth: { token: SECRET_KEY }
});

/**
 * CONNECTED
 */
socket.on('connect', () => {
   console.log("✅ Socket.IO connected");

   const helloPayload = {
      office_id: office_id,
      office_name: office_name,
      platform: "windows",
      version: "1.0.0"
   };

   console.log("📤 Sending HELLO:", helloPayload);
   socket.emit('HELLO', helloPayload);
});

/**
 * MESSAGE FROM SERVER
 */
socket.on('HTTP_TRIGGER', async (data) => {
   console.log("📦 Parsed data:", data);

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

      socket.emit('RESULT', {
         job_id,
         office_id: office_id,
         office_name: office_name,
         device_id,
         status: "SUCCESS",
         http_status: response.status,
         body: response.data
      });

      console.log("Header Response", response.status);
      console.log("Header Body", response.data);

   } catch (err) {
      console.error("❌ HTTP FAILED");
      console.error("💥 Error:", err.message);

      socket.emit('RESULT', {
         job_id,
         office_id: office_id,
         office_name: office_name,
         device_id,
         status: "FAILED",
         error: err.message
      });
   }
});

/**
 * ERROR
 */
socket.on('connect_error', (err) => {
   console.error("🔥 Socket.IO error:", err.message);
});

/**
 * DISCONNECTED
 */
socket.on('disconnect', () => {
   console.warn("🔌 Socket.IO disconnected");
});
