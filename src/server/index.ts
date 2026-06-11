// Entry point: one HTTP server handles the REST auth endpoints and also
// hosts the WebSocket upgrade on /ws.

import http from "node:http";
import { WebSocketServer } from "ws";
import { register, login } from "./auth.js";
import { hub } from "./hub.js";
import { DEFAULT_PORT } from "../shared/protocol.js";

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && (req.url === "/api/register" || req.url === "/api/login")) {
      const body = await readJson(req);
      const username = String(body.username ?? "");
      const password = String(body.password ?? "");
      const result =
        req.url === "/api/register"
          ? await register(username, password)
          : await login(username, password);
      return sendJson(res, 200, result);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => hub.handleConnection(ws));

server.listen(PORT, () => {
  console.log(`\n  termchat server listening on http://localhost:${PORT}`);
  console.log(`  WebSocket endpoint: ws://localhost:${PORT}/ws\n`);
});
