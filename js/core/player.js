/*
 player.js
 Plays 30-second iTunes preview URLs. No account or Premium required.
*/

let isPlaying = false;
let trackId   = null;

// Kept so scanner.js can still set it without errors
let spotifyTrackUri = null;

const audio = new Audio();

/*
 Reads URL params on page load and queues the preview if one is present.
*/
function initPlayer() {
    const params         = new URLSearchParams(window.location.search);
    const encodedPreview = params.get('preview');
    trackId = params.get('id') || null;

    if (trackId) {
        document.getElementById('mystery-id').textContent =
            `Mystery Track #${trackId.substring(0, 6)}`;
    }

    if (encodedPreview) {
        try {
            const previewUrl = atob(encodedPreview.replace(/-/g, '+').replace(/_/g, '/'));
            loadPreviewFromUrl(previewUrl);
        } catch {
            showError('Error decoding track information');
        }
    } else if (params.get('track')) {
        // Legacy Spotify URI format — cards need to be regenerated
        document.getElementById('status-message').textContent =
            'This card was made with an older version. Please regenerate your card deck.';
    } else {
        document.getElementById('status-message').textContent =
            'Scan a QR code to load a track';
    }
}

/*
 Sets the audio source to a preview URL and readies the player.
 Called by initPlayer (URL param) and scanner.js (QR scan).
 @param {string} url  Direct iTunes preview URL
*/
function loadPreviewFromUrl(url) {
    audio.pause();
    isPlaying = false;
    updatePlayButton();

    audio.src = url;
    document.getElementById('player-wrapper').style.display = 'block';
    document.getElementById('status-message').textContent   = 'Tap play to hear the mystery track';
}

/* Handles the play/pause button. */
function handlePlayPause() {
    if (!audio.src) {
        startScanner();
        return;
    }

    if (isPlaying) {
        audio.pause();
        isPlaying = false;
    } else {
        audio.play().catch(e => {
            isPlaying = false;
            updatePlayButton();
            // A dead source also fires the audio 'error' event, which handles
            // recovery — only surface other failures (e.g. autoplay policy).
            if (e.name !== 'NotSupportedError') showError('Playback error: ' + e.message);
        });
        isPlaying = true;
    }
    updatePlayButton();
}

audio.addEventListener('ended', () => {
    isPlaying = false;
    updatePlayButton();
    document.getElementById('status-message').textContent = 'Track ended — guess the song!';
});

// Card ID for which a preview recovery has already been attempted, so a dead
// recovered URL doesn't trigger an endless lookup loop.
let recoveryAttemptedFor = null;

audio.addEventListener('error', async () => {
    isPlaying = false;
    updatePlayButton();

    // The preview URL baked into a printed card can expire. When the card is
    // registered in the backend (window.recoverCardPreview is exposed by
    // js/backend/cards.js), look the track up and fetch a fresh preview.
    if (trackId && trackId !== recoveryAttemptedFor && typeof window.recoverCardPreview === 'function') {
        recoveryAttemptedFor = trackId;
        document.getElementById('status-message').textContent =
            'Preview link expired — looking up a fresh copy…';
        try {
            const freshUrl = await window.recoverCardPreview(trackId);
            if (freshUrl && freshUrl !== audio.src) {
                loadPreviewFromUrl(freshUrl);
                return;
            }
        } catch (e) {
            console.warn('Preview recovery failed:', e);
        }
    }

    showError('Could not play preview — the link may have expired. Regenerate your cards.');
});

/* Toggles the play/pause icon. */
function updatePlayButton() {
    const btn = document.getElementById('play-button');
    if (!btn) return;
    btn.innerHTML = isPlaying
        ? '<div class="pause-icon"><span></span><span></span></div>'
        : '<div class="play-icon"></div>';
}

/* Displays an error in the status area. */
function showError(message) {
    console.error('Error:', message);
    document.getElementById('status-message').innerHTML =
        `<div class="error">${message}</div>`;
}
