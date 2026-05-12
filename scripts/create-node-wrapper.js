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
 * Node.js HTTP Server Wrapper for TanStack Start
 * Converts the Cloudflare Worker fetch handler to Node.js HTTP server
 */

import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

// Import and validate the handler
let handler;
try {
  const module = await import('./server.js');
  handler = module.default;
  
  if (!handler || typeof handler.fetch !== 'function') {
    throw new Error(\`Invalid handler: expected fetch method, got \${typeof handler?.fetch}\`);
  }
  
  console.log('[START] Handler loaded successfully');
} catch (error) {
  console.error('[ERROR] Failed to load handler:', error.message);
  process.exit(1);
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const requestId = Date.now();
  
  try {
    console.log(\`[\${requestId}] \${req.method} \${req.url}\`);

    // Construct full URL
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    
    if (!host) {
      throw new Error('Missing host header');
    }
    
    const url = new URL(\`\${proto}://\${host}\${req.url}\`);

    // Collect body for non-GET requests
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = chunks.length > 0 ? Buffer.concat(chunks) : null;
    }

    // Create Fetch API Request
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body,
      duplex: 'half',
    });

    // Call handler
    const response = await handler.fetch(request, {}, {});

    if (!response || !(response instanceof Response)) {
      throw new Error(\`Handler returned invalid response: \${typeof response}\`);
    }

    console.log(\`[\${requestId}] \${response.status}\`);

    // Send headers
    const headers = Object.fromEntries(response.headers);
    res.writeHead(response.status, headers);

    // Stream body
    if (response.body) {
      const reader = response.body.getReader?.();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          reader.releaseLock?.();
        }
      } else {
        res.end(await response.arrayBuffer());
      }
    } else {
      res.end();
    }
  } catch (error) {
    console.error(\`[\${requestId}] ERROR:\`, error.message);
    
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(\`500 Internal Server Error\\n\\nError: \${error.message}\\n\\nStack:\\n\${error.stack}\`);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(\`[START] Server listening on http://0.0.0.0:\${port}\`);
});

// Graceful shutdown
['SIGTERM', 'SIGINT'].forEach(sig => {
  process.on(sig, () => {
    console.log(\`[\${sig}] Shutting down...\`);
    server.close(() => {
      console.log('[EXIT] Server closed');
      process.exit(0);
    });
  });
});
`;

try {
  // Ensure dist/server directory exists
  if (!fs.existsSync(distServerDir)) {
    console.error('Error: dist/server directory not found. Make sure to run "npm run build" first');
    process.exit(1);
  }

  // Write the wrapper
  fs.writeFileSync(wrapperPath, wrapperCode, { mode: 0o755 });
  console.log(`✓ Created wrapper at ${path.relative(process.cwd(), wrapperPath)}`);
} catch (error) {
  console.error('Error creating wrapper:', error.message);
  process.exit(1);
}
