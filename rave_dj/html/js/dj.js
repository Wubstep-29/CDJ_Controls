'use strict';

const DJPanel = (() => {
    // State per deck
    const deck = {
        A: { url: '', isPlaying: false, looping: false, cueTime: 0, rotation: 0, rafId: null },
        B: { url: '', isPlaying: false, looping: false, cueTime: 0, rotation: 0, rafId: null },
    };

    // DJ-side mixer state — combines fader × gain into the broadcast volume.
    // Crossfade is server state so it isn't tracked here.
    const mixer = {
        A: { fader: 1.0, gain: 1.0 },
        B: { fader: 1.0, gain: 1.0 },
    };

    // Current BPM drives the waveform beat-pulse envelope
    let currentBpm = 128;

    // ── Jog Wheel ─────────────────────────────────────────────
    function startJog(id) {
        const el = document.getElementById(`jog-${id.toLowerCase()}`);
        const center = el.querySelector('.jog-center');
        const d = deck[id];
        if (d.rafId) return;

        let last = performance.now();
        function spin(now) {
            const dt = now - last;
            last = now;
            d.rotation = (d.rotation + dt * 0.12) % 360;
            center.style.transform = `rotate(${d.rotation}deg)`;
            d.rafId = requestAnimationFrame(spin);
        }
        d.rafId = requestAnimationFrame(spin);
    }

    function stopJog(id) {
        const d = deck[id];
        if (d.rafId) { cancelAnimationFrame(d.rafId); d.rafId = null; }
    }

    // ── Waveform Visualizer ────────────────────────────────────
    function drawWaveform(id, active) {
        const canvas = document.getElementById(`wave-${id.toLowerCase()}`);
        const ctx    = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const color = id === 'A' ? '#00e5ff' : '#00ff88';

        ctx.clearRect(0, 0, w, h);
        if (!active) {
            // Draw flat line
            ctx.strokeStyle = '#242424';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
            return;
        }

        // BPM-synced beat envelope: strong attack on each beat, decays across it,
        // with a heavier kick on the downbeat (first of every 4).
        const beatMs    = 60000 / Math.max(40, currentBpm);
        const now       = Date.now();
        const beatPhase = (now % beatMs) / beatMs;          // 0..1 within this beat
        const beatIdx   = Math.floor(now / beatMs) % 4;     // bar position
        const envelope  = Math.pow(1 - beatPhase, 2.2);     // attack-decay shape
        const kick      = 0.45 + envelope * (beatIdx === 0 ? 0.55 : 0.35);

        const bars = 44;
        const barW = w / bars;
        ctx.fillStyle = color;

        for (let i = 0; i < bars; i++) {
            const rand   = Math.sin(i * 3.7) * 0.5 + 0.5;                         // stable per-bar
            const wobble = Math.sin((beatPhase + i * 0.12) * Math.PI * 2) * 0.15 + 0.85;
            const amp    = rand * wobble * kick;
            const barH   = Math.max(2, amp * h * 0.85);
            ctx.globalAlpha = 0.5 + amp * 0.5;
            ctx.fillRect(i * barW + 1, h / 2 - barH / 2, barW - 1, barH);
        }
        ctx.globalAlpha = 1;
    }

    let waveRaf = null;
    function startWaveLoop() {
        if (waveRaf) return;
        function loop() {
            drawWaveform('A', deck.A.isPlaying);
            drawWaveform('B', deck.B.isPlaying);
            waveRaf = requestAnimationFrame(loop);
        }
        waveRaf = requestAnimationFrame(loop);
    }

    // ── Time display ───────────────────────────────────────────
    let timeRaf = null;
    // playStart: timestamp (ms) when current play session began, 0 if paused
    // accumulatedMs: total played time from previous sessions on this track
    const playStart     = { A: 0, B: 0 };
    const accumulatedMs = { A: 0, B: 0 };

    function formatTime(seconds) {
        if (!seconds || seconds < 0) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    function elapsedMs(id) {
        if (playStart[id] > 0) return accumulatedMs[id] + (Date.now() - playStart[id]);
        return accumulatedMs[id];
    }

    function updateTimeDisplays() {
        for (const id of ['A', 'B']) {
            document.getElementById(`time-${id.toLowerCase()}`).textContent =
                formatTime(elapsedMs(id) / 1000);
        }
        timeRaf = requestAnimationFrame(updateTimeDisplays);
    }

    function resetTime(id) {
        playStart[id]     = 0;
        accumulatedMs[id] = 0;
        document.getElementById(`time-${id.toLowerCase()}`).textContent = '00:00:00';
    }

    // ── Play / Pause ───────────────────────────────────────────
    function setPlaying(id, playing) {
        deck[id].isPlaying = playing;
        const btn = document.getElementById(`play-${id.toLowerCase()}`);
        btn.textContent = playing ? '◼ PAUSE' : '▶ PLAY';
        btn.classList.toggle('playing', playing);

        if (playing) {
            playStart[id] = Date.now();
            startJog(id);
        } else {
            if (playStart[id] > 0) {
                accumulatedMs[id] += Date.now() - playStart[id];
                playStart[id] = 0;
            }
            stopJog(id);
        }
        nuiPost('dj:play', { deckId: id, isPlaying: playing });
    }

    // ── Load Track ─────────────────────────────────────────────
    const YT_URL_RE = /youtube\.com|youtu\.be/i;

    function cleanStreamName(url) {
        try {
            const last = decodeURIComponent(url.split('/').pop().split('?')[0]);
            const stripped = last.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-]+/g, ' ').trim();
            return stripped || url;
        } catch (e) {
            return url;
        }
    }

    function displayNameForUrl(url) {
        return YT_URL_RE.test(url) ? 'LOADING…' : cleanStreamName(url);
    }

    function fetchYouTubeTitle(url) {
        return fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
            .then(r => r.ok ? r.json() : null)
            .then(d => (d && d.title) ? d.title : null)
            .catch(() => null);
    }

    // ── Direct-file audio metadata (ID3v2 for MP3, MP4 atoms for M4A/AAC) ──
    function asciiAt(buf, offset, len) {
        const u8 = new Uint8Array(buf, offset, len);
        let s = '';
        for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return s;
    }

    function rangeFetch(url, start, end) {
        return fetch(url, { headers: { Range: `bytes=${start}-${end}` } }).then(r => {
            if (!r.ok && r.status !== 206 && r.status !== 200) return null;
            const cr = r.headers.get('Content-Range') || '';
            const m = cr.match(/\/(\d+)/);
            const total = m ? parseInt(m[1], 10) : 0;
            return r.arrayBuffer().then(buf => ({ buf, total }));
        }).catch(() => null);
    }

    function findAtom(buf, type, startOffset) {
        const view = new DataView(buf);
        let pos = startOffset || 0;
        while (pos + 8 <= buf.byteLength) {
            const size = view.getUint32(pos);
            const t = asciiAt(buf, pos + 4, 4);
            if (size < 8) return null;
            if (size === 1) return null; // 64-bit-size atom — skip (rare)
            if (t === type) {
                if (pos + size > buf.byteLength) return null;
                return buf.slice(pos + 8, pos + size);
            }
            if (pos + size > buf.byteLength) return null;
            pos += size;
        }
        return null;
    }

    function parseID3v2Title(buf) {
        const view = new DataView(buf);
        const version = view.getUint8(3);
        const flags = view.getUint8(5);
        const tagSize =
            (view.getUint8(6) << 21) | (view.getUint8(7) << 14) |
            (view.getUint8(8) <<  7) |  view.getUint8(9);
        let pos = 10;
        if (flags & 0x40) { // extended header
            const extSize = version === 4
                ? ((view.getUint8(pos) << 21) | (view.getUint8(pos+1) << 14) | (view.getUint8(pos+2) << 7) | view.getUint8(pos+3))
                : view.getUint32(pos);
            pos += 4 + extSize;
        }
        const end = Math.min(10 + tagSize, buf.byteLength);
        while (pos + 10 <= end) {
            const id = asciiAt(buf, pos, 4);
            if (id.charCodeAt(0) === 0) break; // padding
            const frameSize = version === 4
                ? ((view.getUint8(pos+4) << 21) | (view.getUint8(pos+5) << 14) | (view.getUint8(pos+6) << 7) | view.getUint8(pos+7))
                : view.getUint32(pos+4);
            pos += 10;
            if (frameSize <= 0 || pos + frameSize > end) break;
            if (id === 'TIT2') return decodeID3Text(buf, pos, frameSize);
            pos += frameSize;
        }
        return null;
    }

    function decodeID3Text(buf, start, len) {
        if (len < 2) return null;
        const enc = new DataView(buf).getUint8(start);
        const u8 = new Uint8Array(buf, start + 1, len - 1);
        let str = '';
        try {
            if (enc === 0)      str = new TextDecoder('iso-8859-1').decode(u8);
            else if (enc === 1) {
                if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE)      str = new TextDecoder('utf-16le').decode(u8.slice(2));
                else if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) str = new TextDecoder('utf-16be').decode(u8.slice(2));
                else                                                          str = new TextDecoder('utf-16le').decode(u8);
            }
            else if (enc === 2) str = new TextDecoder('utf-16be').decode(u8);
            else if (enc === 3) str = new TextDecoder('utf-8').decode(u8);
        } catch (e) { return null; }
        return str.replace(/\0.*$/, '').trim() || null;
    }

    function parseMP4Title(moov) {
        const udta = findAtom(moov, 'udta', 0);
        if (!udta) return null;
        const meta = findAtom(udta, 'meta', 0);
        if (!meta) return null;
        // `meta` is a "full atom" with a 4-byte version/flags prefix — try that first, fall back to offset 0
        let ilst = findAtom(meta, 'ilst', 4) || findAtom(meta, 'ilst', 0);
        if (!ilst) return null;
        const nam = findAtom(ilst, '\u00A9nam', 0);
        if (!nam) return null;
        const data = findAtom(nam, 'data', 0);
        if (!data || data.byteLength < 8) return null;
        try {
            return new TextDecoder('utf-8').decode(new Uint8Array(data, 8)).trim() || null;
        } catch (e) { return null; }
    }

    function fetchAudioMetaTitle(url) {
        return rangeFetch(url, 0, 524287).then(first => {
            if (!first || !first.buf) return null;
            const head = first.buf;
            if (head.byteLength >= 10 && asciiAt(head, 0, 3) === 'ID3') {
                return parseID3v2Title(head);
            }
            const moov = findAtom(head, 'moov', 0);
            if (moov) return parseMP4Title(moov);
            // moov may be at end of file (non-fast-start MP4s)
            const total = first.total;
            if (total > head.byteLength) {
                const tailStart = Math.max(head.byteLength, total - 1048576);
                return rangeFetch(url, tailStart, total - 1).then(tail => {
                    if (!tail || !tail.buf) return null;
                    const tailMoov = findAtom(tail.buf, 'moov', 0);
                    return tailMoov ? parseMP4Title(tailMoov) : null;
                });
            }
            return null;
        }).catch(() => null);
    }

    function loadTrack(id, urlOverride) {
        const input = document.getElementById(`url-${id.toLowerCase()}`);
        const url   = (urlOverride !== undefined ? urlOverride : input.value.trim());
        if (!url) return;
        if (urlOverride !== undefined) input.value = url;

        deck[id].url = url;
        deck[id].isPlaying = false;
        setPlaying(id, false);
        resetTime(id);

        const side = id.toLowerCase();
        const initialName = displayNameForUrl(url);
        const nameEl = document.getElementById(`track-name-${side}`);
        nameEl.textContent = initialName.slice(0, 40);

        Library.add(side, url, initialName);

        nuiPost('dj:loadTrack', { deckId: id, url });

        // Asynchronously resolve real title and patch display + library
        const titlePromise = YT_URL_RE.test(url) ? fetchYouTubeTitle(url) : fetchAudioMetaTitle(url);
        titlePromise.then(title => {
            if (!title) return;
            if (deck[id].url === url) nameEl.textContent = title.slice(0, 40);
            Library.setName(side, url, title);
        });
    }

    // ── Library (per-deck, localStorage) ───────────────────────
    const Library = (() => {
        const KEYS = { a: 'rave_dj_library_a_v1', b: 'rave_dj_library_b_v1' };
        const LEGACY_KEY = 'rave_dj_library_v1';
        let items = { a: [], b: [] };

        function read() {
            // One-time migration: move pre-split single library into side A
            try {
                const legacy = localStorage.getItem(LEGACY_KEY);
                if (legacy && !localStorage.getItem(KEYS.a) && !localStorage.getItem(KEYS.b)) {
                    localStorage.setItem(KEYS.a, legacy);
                    localStorage.removeItem(LEGACY_KEY);
                }
            } catch (e) {}

            ['a', 'b'].forEach(side => {
                try {
                    const raw = localStorage.getItem(KEYS[side]);
                    items[side] = raw ? JSON.parse(raw) : [];
                    if (!Array.isArray(items[side])) items[side] = [];
                } catch (e) { items[side] = []; }
            });
        }

        function write(side) {
            try { localStorage.setItem(KEYS[side], JSON.stringify(items[side])); } catch (e) {}
        }

        function add(side, url, name) {
            if (!url || !items[side]) return;
            if (items[side].some(t => t.url === url)) return;
            items[side].unshift({ url, name: (name || url).slice(0, 80), t: Date.now() });
            write(side);
            render();
        }

        function remove(side, url) {
            if (!items[side]) return;
            items[side] = items[side].filter(t => t.url !== url);
            write(side);
            render();
        }

        function setName(side, url, name) {
            if (!items[side] || !name) return;
            const item = items[side].find(t => t.url === url);
            if (!item) return;
            item.name = String(name).slice(0, 80);
            write(side);
            render();
        }

        function escapeText(s) {
            return String(s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[c]);
        }

        const SIDES = [
            { side: 'a', act: 'A' },
            { side: 'b', act: 'B' },
        ];

        function render() {
            SIDES.forEach(({ side, act }) => {
                const list  = document.getElementById(`library-list-${side}`);
                const empty = document.getElementById(`library-empty-${side}`);
                const count = document.getElementById(`library-count-${side}`);
                if (!list) return;

                const sideItems = items[side];
                count.textContent = sideItems.length;
                if (sideItems.length === 0) {
                    list.innerHTML = '';
                    empty.classList.remove('hidden');
                    return;
                }
                empty.classList.add('hidden');
                list.innerHTML = sideItems.map(t => `
                    <div class="library-row" data-url="${escapeText(t.url)}">
                        <span class="library-row-name" title="${escapeText(t.url)}">${escapeText(t.name)}</span>
                        <button class="library-btn library-btn--edit" data-act="E" title="Rename">✎</button>
                        <button class="library-btn library-btn--${act.toLowerCase()}" data-act="${act}">${act}</button>
                        <button class="library-btn library-btn--del" data-act="X">✕</button>
                    </div>
                `).join('');
            });
        }

        function startEdit(side, url, row) {
            const nameEl = row.querySelector('.library-row-name');
            if (!nameEl) return;
            const oldName = nameEl.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldName;
            input.className = 'library-row-edit';
            input.maxLength = 80;
            nameEl.replaceWith(input);
            input.focus();
            input.select();

            let done = false;
            const commit = () => {
                if (done) return;
                done = true;
                const val = input.value.trim();
                if (val && val !== oldName) setName(side, url, val);
                else render();
            };
            const cancel = () => {
                if (done) return;
                done = true;
                render();
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')      { e.preventDefault(); commit(); }
                else if (e.key === 'Escape'){ e.preventDefault(); cancel(); }
            });
        }

        function init() {
            read();
            render();
            SIDES.forEach(({ side }) => {
                const el = document.getElementById(`library-list-${side}`);
                if (!el) return;
                el.addEventListener('click', (e) => {
                    const btn = e.target.closest('.library-btn');
                    if (!btn) return;
                    const row = btn.closest('.library-row');
                    const url = row.dataset.url;
                    const act = btn.dataset.act;
                    if (act === 'A' || act === 'B') loadTrack(act, url);
                    else if (act === 'X') remove(side, url);
                    else if (act === 'E') startEdit(side, url, row);
                });
            });
        }

        return { init, add, remove, setName };
    })();

    // ── EQ Knob drag ──────────────────────────────────────────
    function initKnob(knobEl, onChange) {
        let startY = 0;
        let startVal = parseInt(knobEl.dataset.value, 10);

        knobEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY   = e.clientY;
            startVal = parseInt(knobEl.dataset.value, 10);

            function onMove(e) {
                const delta = startY - e.clientY;
                const newVal = Math.max(0, Math.min(100, startVal + delta));
                knobEl.dataset.value = newVal;
                // Rotate from -135deg (0) to +135deg (100)
                const rot = -135 + (newVal / 100) * 270;
                const marker = knobEl.querySelector ? knobEl : knobEl;
                knobEl.style.setProperty('--rot', `${rot}deg`);
                knobEl.style.transform = `rotate(${rot}deg)`;
                onChange(newVal / 100);
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function eqGainFromNorm(norm) {
        // norm 0–1 → gain -12 to +12 dB, center (0.75 in our knob) = 0 dB
        return (norm - 0.75) * (12 / 0.25);
    }

    function applyEQ(deckId, band, norm) {
        const gain = eqGainFromNorm(norm);
        // Broadcast to everyone's xsound (DJ hears it like everyone else)
        nuiPost('dj:eq', { deckId, band, gain });
    }

    // ── Init ───────────────────────────────────────────────────
    let initialized = false;
    function init() {
        if (initialized) return;
        initialized = true;
        // Load buttons
        document.getElementById('load-a').addEventListener('click', () => loadTrack('A'));
        document.getElementById('load-b').addEventListener('click', () => loadTrack('B'));
        document.getElementById('url-a').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadTrack('A'); });
        document.getElementById('url-b').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadTrack('B'); });

        // Play buttons
        document.getElementById('play-a').addEventListener('click', () => setPlaying('A', !deck.A.isPlaying));
        document.getElementById('play-b').addEventListener('click', () => setPlaying('B', !deck.B.isPlaying));

        // Cue buttons (stores cue point locally; broadcast seek not wired server-side)
        document.getElementById('cue-a').addEventListener('click', () => { /* cueTime already tracked on deck.A */ });
        document.getElementById('cue-b').addEventListener('click', () => { /* cueTime already tracked on deck.B */ });

        // Loop buttons (visual state only — server broadcast not wired)
        document.getElementById('loop-a').addEventListener('click', function() {
            deck.A.looping = !deck.A.looping;
            this.classList.toggle('active', deck.A.looping);
        });
        document.getElementById('loop-b').addEventListener('click', function() {
            deck.B.looping = !deck.B.looping;
            this.classList.toggle('active', deck.B.looping);
        });

        // Crossfader
        document.getElementById('crossfader').addEventListener('input', function() {
            nuiPost('dj:crossfade', { value: this.value / 100 });
        });

        // Channel faders + Gain knobs combine into a single deck volume.
        function sendDeckVolume(id) {
            const v = Math.max(0, Math.min(1.5, mixer[id].fader * mixer[id].gain));
            nuiPost('dj:volume', { deckId: id, value: v });
        }
        document.getElementById('fader-a').addEventListener('input', function() {
            mixer.A.fader = this.value / 100;
            sendDeckVolume('A');
        });
        document.getElementById('fader-b').addEventListener('input', function() {
            mixer.B.fader = this.value / 100;
            sendDeckVolume('B');
        });
        // Gain knobs (knob norm 0..1, 0.75 center = unity gain, up to ~1.33x boost)
        initKnob(document.getElementById('gain-a'), (norm) => {
            mixer.A.gain = norm / 0.75;
            sendDeckVolume('A');
        });
        initKnob(document.getElementById('gain-b'), (norm) => {
            mixer.B.gain = norm / 0.75;
            sendDeckVolume('B');
        });

        // Pitch sliders
        document.getElementById('pitch-a').addEventListener('input', function() {
            const pct = parseFloat(this.value);
            document.getElementById('pitch-val-a').textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
            const rate = 1.0 + pct / 100;
            nuiPost('dj:pitch', { deckId: 'A', value: rate });
        });
        document.getElementById('pitch-b').addEventListener('input', function() {
            const pct = parseFloat(this.value);
            document.getElementById('pitch-val-b').textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
            const rate = 1.0 + pct / 100;
            nuiPost('dj:pitch', { deckId: 'B', value: rate });
        });

        // EQ Knobs
        for (const deckId of ['a', 'b']) {
            for (const band of ['hi', 'mid', 'lo']) {
                const knobEl = document.getElementById(`eq-${deckId}-${band}`);
                initKnob(knobEl, (norm) => applyEQ(deckId.toUpperCase(), band, norm));
            }
        }

        // Go live button
        document.getElementById('go-live-btn').addEventListener('click', function() {
            this.classList.toggle('live');
            this.textContent = this.classList.contains('live') ? '● LIVE' : 'GO LIVE';
            const statusDot   = document.getElementById('dj-status');
            const statusLabel = document.getElementById('dj-status-label');
            if (this.classList.contains('live')) {
                statusDot.className = 'status-dot status-live';
                statusLabel.textContent = 'LIVE';
            } else {
                statusDot.className = 'status-dot status-off';
                statusLabel.textContent = 'OFFLINE';
            }
        });

        Library.init();

        startWaveLoop();
        if (!timeRaf) updateTimeDisplays();
    }

    // ── External callbacks ─────────────────────────────────────
    function onSync(data) {
        // Update BPM displays from server state
        if (data.bpm) updateBPMDisplay(data.bpm);
    }

    function updateBPMDisplay(bpm) {
        currentBpm = bpm;
        document.getElementById('bpm-a').textContent = bpm;
        document.getElementById('bpm-b').textContent = bpm;
    }

    function onDJLeft() {
        for (const id of ['A', 'B']) {
            setPlaying(id, false);
            deck[id].url = '';
            document.getElementById(`track-name-${id.toLowerCase()}`).textContent = 'NO TRACK LOADED';
            resetTime(id);
        }
        document.getElementById('go-live-btn').classList.remove('live');
        document.getElementById('go-live-btn').textContent = 'GO LIVE';
        document.getElementById('dj-status').className = 'status-dot status-off';
        document.getElementById('dj-status-label').textContent = 'OFFLINE';
    }

    return { init, onSync, onDJLeft, updateBPMDisplay };
})();
