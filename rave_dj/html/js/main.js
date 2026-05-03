'use strict';

const nuiPost = (callback, data = {}) =>
    fetch(`https://${GetParentResourceName()}/${callback}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

// Panels
const djPanel = document.getElementById('dj-panel');

let currentRole = null;

function showRole(role) {
    djPanel.classList.remove('hidden');
    currentRole = role;
}

function closeAll() {
    djPanel.classList.add('hidden');
    currentRole = null;
}

// Close button
document.getElementById('dj-close').addEventListener('click', () => {
    nuiPost('closeUI');
    closeAll();
});

// Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        nuiPost('escapeUI');
        closeAll();
    }
});

// ─── Messages from Lua ──────────────────────────────────────
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.action) return;

    switch (msg.action) {
        case 'openRole':
            showRole(msg.role);
            DJPanel.init();
            break;

        case 'close':
            closeAll();
            break;

        case 'syncTrack':
            if (currentRole === 'dj') {
                DJPanel.onSync(msg);
            }
            break;

        case 'setBPM':
            if (currentRole === 'dj') {
                DJPanel.updateBPMDisplay(msg.bpm);
            }
            break;

        case 'djLeft':
            // Another player's DJ disconnected — stop our local audio monitors
            if (currentRole === 'dj') DJPanel.onDJLeft();
            break;

    }
});
