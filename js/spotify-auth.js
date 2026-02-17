/**
 * spotify-auth.js
 * Shared Spotify OAuth helpers: login, token management, logout, user profile.
 */

const CLIENT_ID   = '657c1306a4c345328542c2b883db38c3';
const REDIRECT_URI = 'https://wilgoy23.github.io/MyHitster1/callback.html';

/**
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

/**
 * Saves the access token and its expiry time to localStorage.
 * @param {string} token
 * @param {string|number} expiresIn  seconds until expiry
 */
function storeToken(token, expiresIn) {
    localStorage.setItem('spotify_access_token', token);
    localStorage.setItem('spotify_token_expiration', Date.now() + parseInt(expiresIn) * 1000);
}

/**
 * Clears all Spotify-related data from localStorage.
 */
function clearToken() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiration');
    localStorage.removeItem('spotify_user_name');
}

/**
 * Redirects to Spotify's authorization page.
 * Stores the current URL so we can return after auth.
 */
function initiateLogin() {
    console.log('Initiating Spotify login');
    localStorage.setItem('original_url', window.location.href);
    clearToken();

    const scopes = [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-read-playback-state',
        'user-modify-playback-state',
    ].join(' ');

    const authUrl =
        'https://accounts.spotify.com/authorize' +
        '?client_id='     + CLIENT_ID +
        '&response_type=token' +
        '&redirect_uri='  + encodeURIComponent(REDIRECT_URI) +
        '&scope='         + encodeURIComponent(scopes) +
        '&show_dialog=true';

    window.location.href = authUrl;
}

/**
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

/**
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