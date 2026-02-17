/**
 * player.js
 * Manages the Spotify Web Playback SDK: init, play/pause, premium check.
 * Depends on: spotify-auth.js
 */

let player          = null;
let deviceId        = null;
let accessToken     = null;
let isPlaying       = false;
let playerActivated = false;
let isMobileDevice  = false;
let spotifyTrackUri = null;
let trackId         = null;

/** Detects mobile and shows the activation notice if needed. */
function checkMobileDevice() {
    isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobileDevice) {
        document.getElementById('mobile-notice').style.display = 'block';
    }
}

/**
 * Starts SDK initialisation flow.
 * Waits for the SDK script to fire onSpotifyWebPlaybackSDKReady if not ready yet.
 */
function initializePlayer() {
    document.getElementById('login-section').style.display    = 'none';
    document.getElementById('loading-section').style.display  = 'block';
    document.getElementById('status-message').textContent     = 'Initializing player...';

    // SDK is already loaded if we got here, just create the player
    createPlayer();
}

/** Creates and connects the Spotify.Player instance. */
function createPlayer() {
    if (!accessToken) {
        showError('Authentication token missing');
        return;
    }

    player = new Spotify.Player({
        name: 'Mystery Music Player',
        getOAuthToken: cb => cb(accessToken),
        volume: 0.5,
    });

    // --- Error listeners ---
    player.addListener('initialization_error', ({ message }) => {
        showError('Player initialization failed: ' + message);
    });

    player.addListener('authentication_error', ({ message }) => {
        showError('Authentication failed: ' + message);
        clearToken();
        document.getElementById('login-section').style.display  = 'block';
        document.getElementById('player-section').style.display = 'none';
    });

    player.addListener('account_error', () => {
        showError('Account error: Premium required for playback');
        checkPremiumStatus();
    });

    player.addListener('playback_error', ({ message }) => {
        console.error('Playback error:', message);
    });

    // --- State change ---
    player.addListener('player_state_changed', state => {
        if (state) {
            isPlaying = !state.paused;
            updatePlayButton();
        }
    });

    // --- Ready ---
    player.addListener('ready', ({ device_id }) => {
        deviceId = device_id;

        document.getElementById('loading-section').style.display  = 'none';
        document.getElementById('player-section').style.display   = 'block';

        if (isMobileDevice) {
            document.getElementById('activate-button').style.display = 'block';
            document.getElementById('status-message').textContent    = 'Please activate the player first';
        } else {
            document.getElementById('status-message').textContent = spotifyTrackUri
                ? 'Tap to play mystery track'
                : 'Scan a QR code to load a track';
        }

        const shortId = trackId ? trackId.substring(0, 6) : 'unknown';
        document.getElementById('mystery-id').textContent = `Mystery Track #${shortId}`;
    });

    player.addListener('not_ready', ({ device_id }) => {
        console.log('Device not ready:', device_id);
    });

    player.connect().then(success => {
        if (!success) {
            showError('Failed to connect to Spotify');
            checkPremiumStatus();
        }
    }).catch(error => {
        showError('Connection error: ' + (error.message || 'Unknown error'));
    });
}

/** Activates the player for mobile browsers (required for autoplay). */
function activatePlayerForMobile() {
    if (!player) return;

    player.activateElement()
        .then(() => {
            playerActivated = true;

            const btn = document.getElementById('activate-button');
            btn.textContent        = 'Player Activated';
            btn.disabled           = true;
            btn.style.backgroundColor = '#666';

            document.getElementById('status-message').textContent =
                'Player activated for mobile. Tap play to begin.';
        })
        .catch(error => showError('Could not activate player: ' + error.message));
}

/** Handles the play/pause button click. */
function handlePlayPause() {
    if (!player || !deviceId) {
        showError('Player not initialized');
        return;
    }

    if (!spotifyTrackUri) {
        showError('No track loaded. Please scan a QR code first.');
        startScanner();
        return;
    }

    if (isMobileDevice && !playerActivated) {
        showError('Please activate the player first');
        document.getElementById('activate-button').style.display = 'block';
        return;
    }

    if (!isPlaying) {
        player.getCurrentState().then(state => {
            const currentUri = state?.track_window?.current_track?.uri;

            if (currentUri === spotifyTrackUri) {
                // Resume existing track
                player.resume().then(() => {
                    isPlaying = true;
                    document.getElementById('player-wrapper').style.display = 'block';
                    updatePlayButton();
                });
            } else {
                // Start a new track
                fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ uris: [spotifyTrackUri] }),
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                })
                .then(response => {
                    if (!response.ok && response.status !== 204) {
                        return response.json().then(data => {
                            throw new Error(data.error.message || 'Failed to play track');
                        });
                    }
                    isPlaying = true;
                    document.getElementById('player-wrapper').style.display = 'block';
                    updatePlayButton();
                })
                .catch(error => showError(error.message));
            }
        });
    } else {
        player.pause().then(() => {
            isPlaying = false;
            updatePlayButton();
        });
    }
}

/** Toggles the play/pause button icon. */
function updatePlayButton() {
    const button = document.getElementById('play-button');
    button.innerHTML = isPlaying
        ? '<div class="pause-icon"><span></span><span></span></div>'
        : '<div class="play-icon"></div>';
}

/**
 * Fetches the user profile and checks whether the account is Spotify Premium.
 * Updates the status message accordingly.
 */
function checkPremiumStatus() {
    if (!accessToken) return;

    fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    .then(r => r.ok ? r.json() : Promise.reject('Profile request failed'))
    .then(profile => {
        if (profile.display_name) {
            localStorage.setItem('spotify_user_name', profile.display_name);
            document.getElementById('user-info').textContent =
                `Signed in as ${profile.display_name}`;
        }

        if (profile.product === 'premium') {
            if (isMobileDevice) {
                document.getElementById('status-message').textContent =
                    'Premium account detected. Please activate the player for mobile.';
                document.getElementById('activate-button').style.display = 'block';
            } else {
                document.getElementById('status-message').textContent =
                    "Your account is premium, but the player couldn't connect.";
            }
        } else {
            document.getElementById('status-message').innerHTML = `
                <div class="error">
                    <strong>Premium Account Required</strong><br>
                    Spotify requires a Premium subscription to use third-party players.<br>
                    Please log in with a Premium account.
                </div>`;
        }
    })
    .catch(error => showError('Could not verify account type: ' + error));
}

/** Displays an error message in the status area. */
function showError(message) {
    console.error('Error:', message);
    document.getElementById('status-message').innerHTML =
        `<div class="error">${message}</div>`;
    document.getElementById('loading-section').style.display = 'none';
}