#!/usr/bin/env node

// Script to create Node.js wrapper for Cloudflare Worker handler
// This allows running the TanStack Start app on Node.js hosting (Vercel, etc)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distServerDir = path.join(__dirname, '../dist/server');
const wrapperPath = path.join(distServerDir, 'index.js');

const wrapperCode = `#!/usr/bin/env node
/**
 * Node.js HTTP Server Wrapper for TanStack Start Cloudflare Worker Handler
 * 
 * Converts the Cloudflare Worker fetch handler to a Node.js HTTP server
 * for compatibility with platforms like Vercel, Node.js hosting, etc.
 */

import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

// Import the built Cloudflare Worker handler
const { default: handler } = await import('./server.js');

const server = http.createServer(async (req, res) => {
  try {
    // Get protocol and host for URL construction
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const urlString = \`\${protocol}://\${host}\${req.url}\`;

    // Convert Node.js request to Fetch API Request
    const fetchRequest = new Request(urlString, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method.toUpperCase()) 
        ? undefined 
        : req,
    });

    // Call the Cloudflare Worker handler's fetch method
    const response = await handler.fetch(fetchRequest, {}, {});

    // Write response status and headers
    res.writeHead(response.status, Object.fromEntries(response.headers));

    // Write response body
    if (response.body) {
      const arrayBuffer = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(\`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>500 - Internal Server Error</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
              margin: 40px; 
              color: #333;
            }
            h1 { color: #d32f2f; margin-bottom: 10px; }
            .error-message { 
              background: #ffebee; 
              border-left: 4px solid #d32f2f; 
              padding: 10px; 
              margin: 10px 0;
            }
            details { margin-top: 20px; }
            summary { cursor: pointer; color: #1976d2; font-weight: 500; }
            pre { 
              background: #f5f5f5; 
              padding: 12px; 
              border-radius: 4px; 
              overflow-x: auto;
              font-size: 12px;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          <h1>500 - Internal Server Error</h1>
          <div class="error-message">
            <strong>\${error.message}</strong>
          </div>
          <details>
            <summary>Stack trace</summary>
            <pre>\${error.stack}</pre>
          </details>
        </body>
      </html>
    \`);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(\`✓ Server running on http://0.0.0.0:\${port}\`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
`;

try {
  // Ensure dist/server directory exists
  if (!fs.existsSync(distServerDir)) {
    console.error('Error: dist/server directory not found. Make sure to run "npm run build" first');
    process.exit(1);
  }

  // Write the wrapper to dist/server/index.js
  fs.writeFileSync(wrapperPath, wrapperCode);
  console.log(`✓ Created Node.js wrapper at ${path.relative(process.cwd(), wrapperPath)}`);
} catch (error) {
  console.error('Error creating wrapper:', error.message);
  process.exit(1);
}
