const WebSocket = require('ws');
const axios = require('axios');

const ws = new WebSocket("ws://192.168.1.8:8080");

ws.on('open', () => {
   ws.send(JSON.stringify({
      type: "HELLO",
      agent_id: "agent-win-01"
   }));
});

ws.on('message', async (msg) => {
   const data = JSON.parse(msg.toString());

   if (data.type === "HTTP_TRIGGER") {
      const { ip, port, device_id } = data.device;
      const path = data.device.command || data.device.path;

      try {
         await axios.post(`http://${ip}:${port}/${path}`);
         ws.send(JSON.stringify({
            type: "RESULT",
            device_id,
            status: "SUCCESS"
         }));
      } catch (err) {
         ws.send(JSON.stringify({
            type: "RESULT",
            device_id,
            status: "FAILED",
            error: err.message
         }));
      }
   }
});
