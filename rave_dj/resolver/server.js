'use strict';

const http     = require('http');
const { execFile } = require('child_process');
const path     = require('path');

const PORT    = 4000;
const YTDLP   = path.join(__dirname, '..', 'yt-dlp.exe');
const TIMEOUT = 25000; // ms — yt-dlp can be slow on first run

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Platform URL patterns yt-dlp can handle
const PLATFORM_RE = /youtube\.com|youtu\.be|soundcloud\.com|twitch\.tv|vimeo\.com|dailymotion\.com/i;

function isPlatform(url) {
    return PLATFORM_RE.test(url);
}

function resolveUrl(url, cb) {
    const args = [
        '--get-url',
        '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        url,
    ];

    let settled = false;
    const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cb(null, 'yt-dlp timed out after 25s');
    }, TIMEOUT);

    execFile(YTDLP, args, { timeout: TIMEOUT }, (err, stdout, stderr) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;

        if (err) {
            return cb(null, (stderr && stderr.trim()) || err.message || 'yt-dlp error');
        }

        // yt-dlp may return multiple lines (e.g. video + audio); take the first
        const streamUrl = stdout.trim().split('\n')[0].trim();
        if (!streamUrl) {
            return cb(null, 'yt-dlp returned no URL — track may be age-gated or region-locked');
        }

        cb(streamUrl, null);
    });
}

// ── HTTP server ────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    if (req.method !== 'POST' || req.url !== '/resolve') {
        res.writeHead(404, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'not found' }));
        return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {

        let parsed;
        try { parsed = JSON.parse(body); } catch {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'invalid JSON body' }));
            return;
        }

        const url = parsed && typeof parsed.url === 'string' && parsed.url.trim();
        if (!url) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'missing or empty url field' }));
            return;
        }

        if (!isPlatform(url)) {
            // Direct URL — nothing to resolve, pass straight back
            res.writeHead(200, JSON_HEADERS);
            res.end(JSON.stringify({ streamUrl: url }));
            return;
        }

        console.log(`[resolver] resolving  ${url}`);

        resolveUrl(url, (streamUrl, err) => {
            if (err) {
                console.error(`[resolver] error      ${err}`);
                res.writeHead(500, JSON_HEADERS);
                res.end(JSON.stringify({ error: err }));
                return;
            }
            // Log a truncated preview so the console isn't spammed
            console.log(`[resolver] ok         ${streamUrl.slice(0, 90)}…`);
            res.writeHead(200, JSON_HEADERS);
            res.end(JSON.stringify({ streamUrl }));
        });
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[rave_dj resolver] running on http://127.0.0.1:${PORT}`);
    console.log(`[rave_dj resolver] yt-dlp path: ${YTDLP}`);
});
