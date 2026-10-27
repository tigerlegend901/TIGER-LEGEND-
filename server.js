const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PLAYER_API =
  'https://auraffxserverinfocheckerapi.onrender.com/api/player';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let url;

  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return sendJson(res, 400, {
      success: false,
      message: 'Invalid request'
    });
  }

  // Free Fire UID Player Name Check API
  if (url.pathname === '/api/player') {
    if (req.method !== 'GET') {
      return sendJson(res, 405, {
        success: false,
        message: 'Method not allowed'
      });
    }

    const uid = (url.searchParams.get('uid') || '').trim();

    if (!/^\d{6,15}$/.test(uid)) {
      return sendJson(res, 400, {
        success: false,
        message: 'সঠিক Free Fire UID দিন'
      });
    }

    return lookupPlayer(uid)
      .then(data => {
        const player = data &&
          (data.player || data.data || data);

        const name = player && (
          player.name ||
          player.AccountName ||
          player.account_name ||
          (player.AccountInfo &&
            player.AccountInfo.AccountName)
        );

        if (
          !name ||
          data.success === false ||
          data.error
        ) {
          return sendJson(res, 404, {
            success: false,
            message: 'Player পাওয়া যায়নি'
          });
        }

        return sendJson(res, 200, {
          success: true,
          uid: uid,
          name: String(name),
          region: String(
            player.region || player.Region || ''
          ),
          level:
            player.level ?? player.Level ?? null
        });
      })
      .catch(err => {
        console.error('UID API error:', err.message);

        return sendJson(res, 502, {
          success: false,
          message: 'UID API সাময়িকভাবে কাজ করছে না'
        });
      });
  }

  // Serve website files
  let safeUrl;

  try {
    safeUrl = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    return res.end('400 Bad Request');
  }

  if (
    safeUrl === '/' ||
    safeUrl === '' ||
    safeUrl === '/index.html'
  ) {
    safeUrl = '/FFX.html';
  }

  const filePath = path.resolve(
    ROOT_DIR,
    '.' + safeUrl
  );

  if (
    filePath !== ROOT_DIR &&
    !filePath.startsWith(ROOT_DIR + path.sep)
  ) {
    res.writeHead(403);
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(ROOT_DIR, 'FFX.html');

      return fs.stat(fallback, (e, s) => {
        if (!e && s.isFile()) {
          serveFile(fallback, res);
        } else {
          res.writeHead(404);
          res.end('404 Not Found');
        }
      });
    }

    serveFile(filePath, res);
  });
});

function lookupPlayer(uid) {
  return new Promise((resolve, reject) => {
    const apiUrl = new URL(PLAYER_API);
    apiUrl.searchParams.set('uid', uid);

    const request = https.get(
      apiUrl,
      {
        headers: { Accept: 'application/json' },
        timeout: 15000
      },
      response => {
        let body = '';

        response.setEncoding('utf8');

        response.on('data', chunk => {
          body += chunk;

          if (body.length > 1024 * 1024) {
            request.destroy(
              new Error('Response too large')
            );
          }
        });

        response.on('end', () => {
          if (
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            return reject(
              new Error('API HTTP ' + response.statusCode)
            );
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid API JSON'));
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('API timeout'));
    });

    request.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(data));
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();

  res.setHeader(
    'Content-Type',
    MIME_TYPES[ext] || 'application/octet-stream'
  );

  res.setHeader('Cache-Control', 'no-cache');

  const stream = fs.createReadStream(filePath);

  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('500 Internal Server Error');
    }
  });

  stream.pipe(res);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});
