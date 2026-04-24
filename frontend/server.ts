/**
 * Custom Next.js server with WebSocket support.
 *
 * Next.js App Router doesn't support WebSocket route handlers natively,
 * so we layer a `ws` WebSocketServer on top of the regular HTTP server.
 *
 * The path /api/twilio/stream is intercepted here and handed to the bridge;
 * everything else is served by Next.js as normal.
 */
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { handleTwilioStream } from './lib/elevenlabs-twilio-bridge';

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server for Twilio media streams
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '');
    if (pathname === '/api/twilio/stream') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        // Pass query-string metadata to the bridge (e.g. agentId, systemPrompt)
        const qs = parse(req.url ?? '', true).query as Record<string, string>;
        handleTwilioStream(ws, qs);
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> WebSocket bridge active at ws://localhost:${port}/api/twilio/stream`);
    if (dev) {
      console.log('> Expose with:  ngrok http ' + port);
      console.log('> Then set NEXT_PUBLIC_BASE_URL=https://<ngrok-subdomain>.ngrok-free.app');
    }
  });
});
