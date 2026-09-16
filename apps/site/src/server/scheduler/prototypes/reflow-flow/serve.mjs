// Run from apps/site: node src/server/scheduler/prototypes/reflow-flow/serve.mjs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';

const { runReflowDemo } = await tsImport('./demo.ts', import.meta.url);
const page = new URL('./index.html', import.meta.url);
const server = createServer(async (request, response) => {
  const send = (status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  };
  if (request.method === 'GET' && request.url === '/health') return send(200, { name: 'BracketIQ Reflow', port: 3100 });
  if (request.method === 'POST' && request.url === '/plan') {
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 4096) return send(413, { error: 'The request is too large.' });
      }
      const { scenario, fieldPolicy } = JSON.parse(body);
      return send(200, runReflowDemo(scenario, fieldPolicy));
    } catch (error) {
      return send(400, { error: error instanceof Error ? error.message : 'Invalid request.' });
    }
  }
  if (request.method !== 'GET' || !['/', '/index.html'].includes(request.url?.split('?')[0])) return send(404, { error: 'Not found.' });
  try {
    const html = await readFile(page);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
  } catch { send(500, { error: 'Cannot read the local walkthrough.' }); }
});
server.listen(3100, '127.0.0.1', () => console.log('BracketIQ Reflow: http://localhost:3100'));
