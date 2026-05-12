#!/usr/bin/env node

// Node.js wrapper to run Cloudflare Worker handler as HTTP server
// Converts Fetch API (Worker format) to Node.js http server

import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the built Workers handler
const { default: handler } = await import('./dist/server/server.js');

const port = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  try {
    // Build full URL
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const urlString = `${protocol}://${host}${req.url}`;

    // Create Fetch API Request
    const fetchRequest = new Request(urlString, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method.toUpperCase()) 
        ? undefined 
        : req,
    });

    // Call the Cloudflare Worker handler
    const response = await handler.fetch(fetchRequest, {}, {});

    // Send response headers
    res.writeHead(response.status, Object.fromEntries(response.headers));

    // Send response body
    if (response.body) {
      const arrayBuffer = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>500 - Server Error</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; }
            h1 { color: #d32f2f; }
            pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>500 - Internal Server Error</h1>
          <p><strong>${error.message}</strong></p>
          <details>
            <summary>Stack trace</summary>
            <pre>${error.stack}</pre>
          </details>
        </body>
      </html>
    `);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`✓ Server running on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
