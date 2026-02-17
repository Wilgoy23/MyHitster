/**
 * account-checker.js
 * Logic for the Spotify Account Checker debug page.
 * Depends on: spotify-auth.js
 */

// DOM references
const loginButton    = document.getElementById('loginButton');
const checkButton    = document.getElementById('checkButton');
const clearButton    = document.getElementById('clearButton');
const tokenStatus    = document.getElementById('tokenStatus');
const resultDiv      = document.getElementById('result');
const accountInfoDiv = document.getElementById('accountInfo');
const tokenPreview   = document.getElementById('token-preview');
const tokenInfo      = document.getElementById('token-info');
const debugToggle    = document.getElementById('debug-toggle');
const debugPanel     = document.getElementById('debug-panel');

document.getElementById('client-id-display').textContent    = CLIENT_ID;
document.getElementById('redirect-uri-display').textContent = REDIRECT_URI;

let accessToken = null;

// ── Debug panel ─────────────────────────────────────────────────────────────

debugToggle.addEventListener('click', () => {
    debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
});

function debugLog(message, data) {
    const entry = document.createElement('div');
    entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;

    if (data !== undefined) {
        try {
            if (typeof data === 'object') {
                const pre = document.createElement('pre');
                pre.style.fontSize = '10px';
                pre.textContent = JSON.stringify(data, null, 2);
                entry.appendChild(pre);
            } else {
                entry.textContent += ` — ${data}`;
            }
        } catch {
            entry.textContent += ' [Data cannot be displayed]';
        }
    }

    debugPanel.appendChild(entry);
    debugPanel.scrollTop = debugPanel.scrollHeight;
    console.log(message, data ?? '');
}

// ── Token helpers ────────────────────────────────────────────────────────────

function checkForToken() {
    debugLog('Checking for token in URL hash or localStorage');

    const hash = window.location.hash.substring(1);
    if (hash) {
        const params = new URLSearchParams(hash);
        const token  = params.get('access_token');

        if (token) {
            accessToken = token;
            history.replaceState(null, null, ' ');
            localStorage.setItem('spotify_access_token', token);
            setConnected();
            checkAccountStatus();
            return true;
        }
    }

    const stored = localStorage.getItem('spotify_access_token');
    if (stored) {
        accessToken = stored;
        tokenStatus.textContent = 'Using stored token';
        tokenStatus.className   = 'success';
        setConnected();
        return true;
    }

    debugLog('No token found');
    return false;
}

function setConnected() {
    checkButton.disabled = false;
    clearButton.disabled = false;
    updateTokenDisplay();
}

function updateTokenDisplay() {
    if (!accessToken) {
        tokenInfo.style.display = 'none';
        return;
    }

    const len = accessToken.length;
    tokenPreview.textContent = len > 20
        ? accessToken.substring(0, 10) + '...' + accessToken.substring(len - 10)
        : accessToken;
    tokenInfo.style.display = 'block';
}

// ── Results helpers ──────────────────────────────────────────────────────────

function log(message, className = '') {
    resultDiv.innerHTML += `<div class="${className}">${message}</div>`;
    resultDiv.scrollTop  = resultDiv.scrollHeight;
}

function clearResults(clearToken = false) {
    resultDiv.textContent      = 'No data yet';
    accountInfoDiv.textContent = 'Not available';

    if (clearToken) {
        localStorage.removeItem('spotify_access_token');
        accessToken             = null;
        tokenStatus.textContent = 'Not connected';
        tokenStatus.className   = '';
        checkButton.disabled    = true;
        clearButton.disabled    = true;
        tokenInfo.style.display = 'none';
    }
}

function displayAccountInfo(profile) {
    if (!profile) {
        accountInfoDiv.textContent = 'No account data available';
        return;
    }

    accountInfoDiv.innerHTML = `
        <table>
            <tr><th>Property</th><th>Value</th></tr>
            <tr><td>Display Name</td><td>${profile.display_name || 'N/A'}</td></tr>
            <tr><td>User ID</td>     <td>${profile.id           || 'N/A'}</td></tr>
            <tr><td>Email</td>       <td>${profile.email        || 'N/A'}</td></tr>
            <tr><td>Country</td>     <td>${profile.country      || 'N/A'}</td></tr>
            <tr><td>Account Type</td><td>${profile.product      || 'N/A'}</td></tr>
            <tr><td>Premium</td>     <td>${profile.product === 'premium' ? 'Yes' : 'No'}</td></tr>
        </table>
        <h3>Profile Image</h3>
        ${profile.images?.length
            ? `<img src="${profile.images[0].url}" alt="Profile"
                    style="width:100px;height:100px;border-radius:50%;">`
            : 'No profile image available'}`;
}

// ── Authenticated fetch ──────────────────────────────────────────────────────

async function fetchWithAuth(url, options = {}) {
    debugLog(`fetchWithAuth → ${url}`);
    if (!accessToken) throw new Error('No access token available');

    const response = await fetch(url, {
        ...options,
        headers: { 'Authorization': `Bearer ${accessToken}`, ...options.headers },
    });

    debugLog(`Response from ${url}`, { status: response.status });

    if (response.status === 401) {
        log('Token invalid or expired', 'error');
        tokenStatus.textContent = 'Token invalid or expired';
        tokenStatus.className   = 'error';
    }
    if (response.status === 403) {
        const text = await response.text();
        debugLog('403 body', text);
        throw new Error('Permission denied (403 Forbidden)');
    }

    return response;
}

// ── Main account check ───────────────────────────────────────────────────────

async function checkAccountStatus() {
    if (!accessToken) { log('Error: No access token', 'error'); return; }

    resultDiv.textContent      = 'Checking account status...';
    accountInfoDiv.textContent = 'Loading...';

    try {
        // 1. Profile
        log('Fetching user profile...');
        const profileRes = await fetchWithAuth('https://api.spotify.com/v1/me');
        const profile    = await profileRes.json();
        log('Profile data received', 'success');
        displayAccountInfo(profile);

        const isPremium = profile.product === 'premium';
        log(
            isPremium ? 'Account has premium status ✓' : 'Account does NOT have premium status ✗',
            isPremium ? 'success' : 'error'
        );

        // 2. Player API
        log('Checking player access...');
        try {
            const playerRes = await fetchWithAuth('https://api.spotify.com/v1/me/player');
            if (playerRes.status === 200 || playerRes.status === 204) {
                log('Successfully accessed player API ✓ (premium feature)', 'success');
            } else {
                log(`Player API access failed — status ${playerRes.status}`, 'error');
                if (playerRes.status === 403) log('Forbidden — indicates non-premium account', 'error');
            }
        } catch (e) {
            log('Error accessing player API: ' + e.message, 'error');
        }

        // 3. Devices
        log('Checking available devices...');
        try {
            const devRes = await fetchWithAuth('https://api.spotify.com/v1/me/player/devices');
            if (devRes.ok) {
                const { devices } = await devRes.json();
                log(`Found ${devices.length} device(s)`);
                devices.forEach(d => log(`Device: ${d.name} (${d.type}), ID: ${d.id}`));
            } else {
                log(`Devices API failed — status ${devRes.status}`, 'error');
            }
        } catch (e) {
            log('Error accessing devices API: ' + e.message, 'error');
        }

        // 4. Web Playback SDK test
        if (window.Spotify) {
            log('Testing Web Playback SDK...');
            const sdkResult = await testPlaybackSDK();

            if (!sdkResult.success && sdkResult.accountError) {
                log('SDK test confirms this is not a valid premium account', 'error');
            }
        } else {
            log('Spotify Web Playback SDK not available in this context');
        }

        // 5. Final assessment
        log('');
        log(`Profile Product Type: ${profile.product || 'unknown'}`);
        log(
            isPremium ? 'Your account appears to be Premium ✓' : 'Your account is NOT Premium ✗',
            isPremium ? 'success' : 'error'
        );

        if (!isPremium) {
            log('The Web Playback SDK requires a Premium account.');
        }

    } catch (error) {
        log('Error checking account status: ' + error.message, 'error');
        console.error(error);
    }
}

/**
 * Tests whether the Spotify Web Playback SDK initialises successfully.
 * Returns { success, device_id?, error?, accountError? }.
 */
function testPlaybackSDK() {
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            resolve({ success: false, error: 'SDK initialization timed out' });
        }, 15000);

        try {
            const sdkPlayer = new Spotify.Player({
                name: 'Account Checker',
                getOAuthToken: cb => { debugLog('SDK requested token'); cb(accessToken); },
            });

            let resolved = false;
            function done(result) {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                resolve(result);
            }

            sdkPlayer.addListener('initialization_error', ({ message }) => {
                log('SDK init error: ' + message, 'error');
                done({ success: false, error: 'initialization: ' + message });
            });
            sdkPlayer.addListener('authentication_error', ({ message }) => {
                log('SDK auth error: ' + message, 'error');
                done({ success: false, error: 'authentication: ' + message });
            });
            sdkPlayer.addListener('account_error', ({ message }) => {
                log('SDK account error: ' + message, 'error');
                done({ success: false, error: 'account: ' + message, accountError: true });
            });
            sdkPlayer.addListener('ready', ({ device_id }) => {
                log(`SDK ready — device ID: ${device_id}`, 'success');
                done({ success: true, device_id });
            });
            sdkPlayer.addListener('not_ready', ({ device_id }) => {
                log(`SDK device ${device_id} not ready`, 'warning');
            });

            sdkPlayer.connect().then(connected => {
                if (!connected) done({ success: false, error: 'Connection failed' });
            }).catch(e => done({ success: false, error: e.message }));

        } catch (e) {
            clearTimeout(timeout);
            resolve({ success: false, error: e.message });
        }
    });
}

// ── Event listeners ──────────────────────────────────────────────────────────

loginButton.addEventListener('click', () => {
    clearResults(true);
    initiateLogin();
});

checkButton.addEventListener('click', checkAccountStatus);
clearButton.addEventListener('click', () => clearResults(false));

window.onSpotifyWebPlaybackSDKReady = () => debugLog('Spotify SDK loaded');

// Auto-check on load if token exists
checkForToken();