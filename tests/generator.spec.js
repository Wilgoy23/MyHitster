const { test, expect } = require('@playwright/test');

const MOCK_ITUNES_RESULT = {
    results: [{
        trackName: 'Bohemian Rhapsody',
        artistName: 'Queen',
        releaseDate: '1975-10-31T07:00:00Z',
        previewUrl: 'https://example.com/preview.mp3',
        collectionName: 'A Night at the Opera',
    }],
};

const MOCK_ITUNES_NO_PREVIEW = {
    results: [{
        trackName: 'Obscure Track',
        artistName: 'Unknown Artist',
        releaseDate: '2020-01-01T00:00:00Z',
        previewUrl: null,
        collectionName: 'Some Album',
    }],
};

// Deezer's own preview field is intentionally omitted — the app ignores it and
// sources previews from iTunes.
const DEEZER_TRACK = {
    title:   'Under Pressure',
    artist:  { name: 'Queen' },
    album:   { id: 555, title: 'Hot Space' },
};

// Deezer is called via JSONP — the payload must be wrapped in the callback.
function deezerFulfill(route, payload) {
    const cb = (route.request().url().match(/callback=([^&]+)/) ?? [])[1] ?? 'cb';
    return route.fulfill({
        contentType: 'application/javascript',
        body: `${cb}(${JSON.stringify(payload)})`,
    });
}

// Mocks a one-page Deezer playlist plus its album (release year 1981).
async function mockDeezer(page, { tracks = [DEEZER_TRACK], releaseDate = '1981-11-30' } = {}) {
    await page.route('**/api.deezer.com/playlist/**', route =>
        deezerFulfill(route, { data: tracks, next: null }));
    await page.route('**/api.deezer.com/album/**', route =>
        deezerFulfill(route, { id: 555, release_date: releaseDate }));
}

async function importPlaylist(page) {
    await page.goto('/card-generator.html');
    await page.fill('#playlist-url-input', 'https://www.deezer.com/playlist/123456');
    await page.click('#playlist-import-btn');
    await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 15000 });
}

test.describe('Card Generator', () => {
    test.beforeEach(async ({ page }) => {
        // The iTunes API is called with fetch(), so mocks return plain JSON.
        await page.route('**/itunes.apple.com/**', route => route.fulfill({ json: MOCK_ITUNES_RESULT }));
        // Block the real Supabase backend (Discogs cross-check no-ops on failure)
        await page.route('**/*.supabase.co/**', route => route.fulfill({ status: 404, json: {} }));
        // Verification runs automatically after import — default to no MB matches
        await page.route('**/musicbrainz.org/**', route => route.fulfill({ json: { recordings: [] } }));
    });

    test('loads with correct initial state', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page).toHaveTitle('MyHitster — Card Generator');
        await expect(page.locator('#playlist-url-input')).toBeVisible();
        await expect(page.locator('#playlist-import-btn')).toBeVisible();
        await expect(page.locator('#track-list-section')).toBeHidden();
        await expect(page.locator('#generate-btn')).toBeHidden();
    });

    test('nav link navigates to player', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.click('.top-bar-nav a[href="index.html"]');
        await expect(page).toHaveURL(/index\.html|\/$|localhost:8080\/$/);
    });

    test('shows error when Deezer URL input is empty', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.click('#playlist-import-btn');
        await expect(page.locator('#status-message')).toContainText('Paste a Deezer playlist URL first');
    });

    test('shows error for invalid Deezer URL', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#playlist-url-input', 'https://www.example.com/not-a-playlist');
        await page.click('#playlist-import-btn');
        await expect(page.locator('#status-message')).toContainText('not recognised');
    });

    test('import triggered by Enter key', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#playlist-url-input', 'https://www.example.com/not-a-playlist');
        await page.press('#playlist-url-input', 'Enter');
        await expect(page.locator('#status-message')).toContainText('not recognised');
    });

    test('fetches a durable iTunes preview per track during verification', async ({ page }) => {
        let itunesRequests = 0;
        await page.route('**/itunes.apple.com/**', route => {
            itunesRequests++;
            return route.fulfill({ json: MOCK_ITUNES_RESULT });
        });
        await mockDeezer(page);

        await importPlaylist(page);

        await expect(page.locator('#track-tbody tr')).toHaveCount(1);
        await expect(page.locator('#track-tbody')).toContainText('Under Pressure');
        // Year still comes from the Deezer/MusicBrainz/Discogs cross-check…
        await expect(page.locator('.year-input')).toHaveValue('1981', { timeout: 15000 });
        await expect(page.locator('.badge-ok')).toBeVisible();
        await expect(page.locator('#generate-btn')).toBeVisible();
        // …while iTunes is searched once per track for the durable preview.
        expect(itunesRequests).toBe(1);
    });

    test('makes a track playable via its iTunes preview', async ({ page }) => {
        await mockDeezer(page);

        await importPlaylist(page);

        await expect(page.locator('.badge-ok')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#generate-btn')).toBeVisible();
    });

    test('shows warning badge and hides generate button when iTunes has no preview', async ({ page }) => {
        await page.route('**/itunes.apple.com/**', route => route.fulfill({ json: MOCK_ITUNES_NO_PREVIEW }));
        await mockDeezer(page);

        await importPlaylist(page);

        await expect(page.locator('.badge-warning')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#generate-btn')).toBeHidden();
    });

    test('generates and downloads a PDF', async ({ page }) => {
        await mockDeezer(page);
        await importPlaylist(page);
        // Let verification (and the durable-preview fetch) finish first.
        await expect(page.locator('#status-message')).toContainText('Verification complete', { timeout: 20000 });

        const download = page.waitForEvent('download', { timeout: 20000 });
        await page.click('#generate-btn');
        const dl = await download;

        expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
        await expect(page.locator('#status-message')).toContainText('PDF downloaded', { timeout: 20000 });
    });

    test('year filter highlights out-of-range tracks', async ({ page }) => {
        await mockDeezer(page);
        await importPlaylist(page);

        await page.click('#panel-year-filter summary');
        await page.fill('#min-year', '1990');
        await page.fill('#max-year', '2000');
        await page.click('#year-filter-apply');

        await expect(page.locator('#track-tbody tr.out-of-range')).toHaveCount(1);
    });

    test('year filter does not highlight in-range tracks', async ({ page }) => {
        await mockDeezer(page);
        await importPlaylist(page);

        await page.click('#panel-year-filter summary');
        await page.fill('#min-year', '1970');
        await page.fill('#max-year', '1990');
        await page.click('#year-filter-apply');

        await expect(page.locator('#track-tbody tr.out-of-range')).toHaveCount(0);
    });

    test('year is editable in track list', async ({ page }) => {
        await mockDeezer(page);
        await importPlaylist(page);

        await page.fill('.year-input', '1974');
        await page.locator('.year-input').press('Tab');
        await expect(page.locator('.year-input')).toHaveValue('1974');
    });

    test('automatically corrects reissue year via MusicBrainz and flags the disagreement', async ({ page }) => {
        await mockDeezer(page, { releaseDate: '2011-09-05' }); // reissue year
        await page.route('**/musicbrainz.org/**', route => route.fulfill({
            json: {
                recordings: [
                    // Low-score fuzzy match must be ignored…
                    { score: 60, title: 'Under Pressure', 'artist-credit': [{ name: 'Queen' }],
                      'first-release-date': '1950-01-01' },
                    // …confident match for the right song provides the real original year.
                    { score: 100, title: 'Under Pressure', 'artist-credit': [{ name: 'Queen' }],
                      'first-release-date': '1981-10-26' },
                ],
            },
        }));

        await importPlaylist(page);

        // Verification runs automatically — earliest credible year wins
        await expect(page.locator('.year-input')).toHaveValue('1981', { timeout: 15000 });
        await expect(page.locator('#track-tbody .year-flag')).toBeVisible();
        await expect(page.locator('#track-tbody .year-flag')).toHaveAttribute('title', /Deezer: 2011.*MusicBrainz: 1981/);
    });

    test('ignores confident MusicBrainz matches for a different song or artist', async ({ page }) => {
        await mockDeezer(page); // real album year 1981
        await page.route('**/musicbrainz.org/**', route => route.fulfill({
            json: {
                recordings: [
                    // Same-named song by another artist — must not pull the year down
                    { score: 100, title: 'Under Pressure', 'artist-credit': [{ name: 'Someone Else' }],
                      'first-release-date': '1950-01-01' },
                    // Different song by the same artist — must not pull the year down
                    { score: 100, title: 'Completely Different Song', 'artist-credit': [{ name: 'Queen' }],
                      'first-release-date': '1955-01-01' },
                ],
            },
        }));

        await importPlaylist(page);

        await expect(page.locator('.year-input')).toHaveValue('1981', { timeout: 15000 });
        await expect(page.locator('#track-tbody .year-flag')).toHaveCount(0);
    });
});
