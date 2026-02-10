const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
console.log("WS Server running on :8080");

wss.on('connection', (ws) => {
   console.log("Agent connected");

   ws.on('message', (msg) => {
      console.log("From agent:", msg.toString());
   });

   // SIMULASI COMMAND
   setTimeout(() => {
      ws.send(JSON.stringify({
         type: "HTTP_TRIGGER",
         android_ip: "192.168.1.2",
         path: "ping"
      }));
      console.log("Command sent");
   }, 5000);
});
