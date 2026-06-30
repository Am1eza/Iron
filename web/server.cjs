/**
 * Startup file for cPanel "Setup Node.js App" (Phusion Passenger).
 *
 * cPanel/Passenger loads THIS file to start the site and provides the port via
 * the PORT env var. We hand every request to Next.js (production mode), so the
 * full app — pages, /api routes, SSR — runs on the server and can reach the
 * local MariaDB database.
 *
 * Prerequisites on the server (done via the cPanel Node.js App UI):
 *   1. "Run NPM Install"
 *   2. run the "build" script (next build)  → produces .next/
 *   3. set environment variables (DB + secrets)
 *   4. Restart
 *
 * CommonJS (.cjs) on purpose: package.json is "type": "module", and Passenger
 * is most reliable with a CommonJS entry point.
 */
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res, parse(req.url, true));
    }).listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`ahantime.com web server ready on port ${port}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start Next.js server:', err);
    process.exit(1);
  });
