/*
 * spotify-auth.js
 * Shared Spotify OAuth helpers: login, token management, logout, user profile.
 * Uses PKCE (Proof Key for Code Exchange) for secure authorization.
 */

const CLIENT_ID   = '657c1306a4c345328542c2b883db38c3';
const REDIRECT_URI = 'https://wilgoy23.github.io/MyHitster/callback.html';

/*
 * Returns the stored access token if it exists and hasn't expired.
 * @returns {string|null}
 */
function getValidToken() {
    const token      = localStorage.getItem('spotify_access_token');
    const expiration = localStorage.getItem('spotify_token_expiration');
    if (token && expiration && Date.now() < parseInt(expiration)) {
        return token;
    }
    return null;
}

/*
 * Saves the access token and its expiry time to localStorage.
 * @param {string} token
 * @param {string|number} expiresIn  seconds until expiry
 */
function storeToken(token, expiresIn) {
    localStorage.setItem('spotify_access_token', token);
    localStorage.setItem('spotify_token_expiration', Date.now() + parseInt(expiresIn) * 1000);
}

/*
 * Clears all Spotify-related data from localStorage.
 */
function clearToken() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiration');
    localStorage.removeItem('spotify_user_name');
    localStorage.removeItem('spotify_code_verifier');
}

/*
 * Generates a random string for PKCE code verifier.
 */
function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
}

/*
 * Creates a code challenge from the verifier.
 */
async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(new Uint8Array(hash));
}

/*
 * Base64 URL encoding (without padding).
 */
function base64URLEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/*
 * Redirects to Spotify's authorization page using PKCE flow.
 * Stores the current URL so we can return after auth.
 */
async function initiateLogin() {
    console.log('Initiating Spotify login with PKCE');
    localStorage.setItem('original_url', window.location.href);
    clearToken();

    const scopes = [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-read-playback-state',
        'user-modify-playback-state',
    ].join(' ');

    // Generate PKCE codes
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Store verifier for later use in callback
    localStorage.setItem('spotify_code_verifier', codeVerifier);

    const authUrl =
        'https://accounts.spotify.com/authorize' +
        '?client_id='            + CLIENT_ID +
        '&response_type=code' +
        '&redirect_uri='         + encodeURIComponent(REDIRECT_URI) +
        '&scope='                + encodeURIComponent(scopes) +
        '&code_challenge_method=S256' +
        '&code_challenge='       + codeChallenge +
        '&show_dialog=true';

    window.location.href = authUrl;
}

/*
 * Fetches the current user's Spotify profile and stores their display name.
 * Optionally updates a DOM element with the user's name.
 * @param {string} token
 * @param {string|null} displayElementId  ID of element to update with username
 */
async function fetchUserProfile(token, displayElementId = null) {
    if (!token) return null;

    try {
        const response = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Profile request failed');

        const data = await response.json();
        const name = data.display_name || data.id;

        if (name) {
            localStorage.setItem('spotify_user_name', name);
            if (displayElementId) {
                const el = document.getElementById(displayElementId);
                if (el) el.textContent = `Signed in as ${name}`;
            }
        }

        return data;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
}

/*
 * Logs the user out: clears tokens, disconnects the player if provided,
 * opens a Spotify logout popup, then resets the UI.
 * @param {object|null} player  Spotify Web Playback SDK player instance
 * @param {Function|null} onComplete  callback after logout completes
 */
function logoutUser(player = null, onComplete = null) {
    console.log('Logging out user');

    if (player) {
        player.disconnect();
    }

    clearToken();
    localStorage.setItem('force_login', 'true');

    const logoutWindow = window.open('https://accounts.spotify.com/logout', '_blank');
    setTimeout(() => {
        if (logoutWindow) logoutWindow.close();
        if (onComplete) onComplete();
    }, 2000);
}