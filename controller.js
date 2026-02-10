const WebSocket = require('ws');
const axios = require('axios');

const VPS_WS = "ws://192.168.1.8:8080";
const ANDROID_PORT = 8080;

// registry device di agent
const devices = {
   device1: { ip: "192.168.1.2" },
   device2: { ip: "192.168.1.3" },
   device3: { ip: "192.168.1.4" }
};

const ws = new WebSocket(VPS_WS);

ws.on('open', () => {
   console.log("Connected to VPS");

   ws.send(JSON.stringify({
      type: "HELLO",
      agent_id: "agent-win-01",
      devices: Object.keys(devices)
   }));
});

ws.on('message', async (msg) => {
   const data = JSON.parse(msg.toString());
   console.log("Command received:", data);

   if (data.type === "HTTP_TRIGGER") {
      const device = devices[data.device_id];
      if (!device) {
         return ws.send(JSON.stringify({
            type: "RESULT",
            status: "FAILED",
            reason: "UNKNOWN_DEVICE"
         }));
      }

      await triggerAndroid(device.ip, data.path, data.device_id);
   }
});

async function triggerAndroid(ip, path, deviceId) {
   try {
      await axios.post(`http://${ip}:${ANDROID_PORT}/${path}`);

      ws.send(JSON.stringify({
         type: "RESULT",
         status: "SUCCESS",
         deviceId,
         path
      }));
   } catch (err) {
      ws.send(JSON.stringify({
         type: "RESULT",
         status: "FAILED",
         deviceId,
         error: err.message
      }));
   }
}
