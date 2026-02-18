/*
 scanner.js
 Manages QR code scanning via the device camera using jsQR.
 Depends on: player.js (for spotifyTrackUri, trackId, handlePlayPause)
 */

let scannerActive   = false;
let scannerLastCode = null;
let scannerCooldown = false;

/* Checks camera support and hides the scan button if unavailable. */
function initScanner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const scanButton = document.getElementById('scan-button');
        if (scanButton) scanButton.style.display = 'none';
    }
}

/* Opens the scanner overlay and starts the camera feed. */
function startScanner() {
    const container = document.getElementById('scanner-container');
    if (!container) return;

    container.style.display = 'flex';
    scannerActive           = true;
    scannerLastCode         = null;
    scannerCooldown         = false;

    const video  = document.getElementById('qr-video');
    const status = document.getElementById('scanner-status');

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment',
            width:  { ideal: 1280 },
            height: { ideal: 720  },
        },
    })
    .then(stream => {
        video.srcObject = stream;
        video.setAttribute('playsinline', true);
        video.play();
        status.textContent = 'Position QR code in the frame';
        requestAnimationFrame(scanTick);
    })
    .catch(err => {
        if (err.name === 'NotAllowedError') {
            status.textContent = 'Camera access denied. Please allow camera access and try again.';
        } else if (err.name === 'NotFoundError') {
            status.textContent = 'No camera found on this device.';
        } else {
            status.textContent = 'Camera error: ' + err.message;
        }
    });
}

/* Stops the camera and hides the scanner overlay. */
function stopScanner() {
    scannerActive = false;

    const container = document.getElementById('scanner-container');
    if (container) container.style.display = 'none';

    const video = document.getElementById('qr-video');
    if (video?.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}

/* Reads a video frame and passes it to jsQR for detection. */
function scanTick() {
    if (!scannerActive) return;

    const video = document.getElementById('qr-video');
    if (!video) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
            const canvas  = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
            });

            if (code && !scannerCooldown && code.data !== scannerLastCode) {
                scannerLastCode = code.data;

                // Flash green on success
                const container = document.getElementById('scanner-container');
                if (container) {
                    container.classList.add('scan-success-flash');
                    setTimeout(() => container.classList.remove('scan-success-flash'), 500);
                }

                processScannedUrl(code.data);

                scannerCooldown = true;
                setTimeout(() => { scannerCooldown = false; }, 2000);
            }
        } catch (e) {
            document.getElementById('scanner-status').textContent =
                'Scanning error: ' + e.message;
        }
    }

    if (scannerActive) requestAnimationFrame(scanTick);
}

/*
 Parses a scanned URL and extracts the Spotify track URI.
 Supports our encoded format (?track=...) and direct Spotify URLs/URIs.
 @param {string} url
*/
function processScannedUrl(url) {
    try {
        const status = document.getElementById('scanner-status');
        status.textContent = 'Processing QR code...';

        if (url.includes('track=')) {
            // Our encoded format
            const urlObj       = new URL(url);
            const encodedTrack = urlObj.searchParams.get('track');
            const qrTrackId    = urlObj.searchParams.get('id');

            if (!encodedTrack) {
                status.textContent = 'Invalid QR code: Missing track data';
                return;
            }

            spotifyTrackUri = atob(encodedTrack.replace(/-/g, '+').replace(/_/g, '/'));
            if (qrTrackId) trackId = qrTrackId;

        } else if (url.startsWith('spotify:') || url.includes('open.spotify.com')) {
            // Direct Spotify link
            status.textContent = 'Direct Spotify link detected';

            if (url.startsWith('spotify:')) {
                spotifyTrackUri = url;
            } else {
                const id = url.split('/track/')[1]?.split('?')[0];
                if (!id) {
                    status.textContent = 'Could not extract track information';
                    return;
                }
                spotifyTrackUri = `spotify:track:${id}`;
            }

            trackId = Math.floor(Math.random() * 1000000).toString(16);

        } else {
            status.textContent = 'Unrecognized QR code format';
            return;
        }

        // Update mystery ID display
        const shortId = trackId ? trackId.substring(0, 6) : 'unknown';
        document.getElementById('mystery-id').textContent = `Mystery Track #${shortId}`;
        status.textContent = 'Track found! Loading...';

        setTimeout(() => {
            stopScanner();
            document.getElementById('status-message').textContent = 'New mystery track loaded!';
            if (player && deviceId && !isPlaying) handlePlayPause();
        }, 1000);

    } catch (e) {
        document.getElementById('scanner-status').textContent = 'Error processing QR code';
        console.error('QR processing error:', e);
    }
}