const { test, expect } = require('@playwright/test');

const MOCK_ALBUM_SEARCH = {
    results: [{
        wrapperType: 'collection',
        collectionType: 'Album',
        collectionId: 99999,
        collectionName: 'A Night at the Opera',
        artistName: 'Queen',
        releaseDate: '1975-11-21T08:00:00Z',
        trackCount: 12,
        artworkUrl100: 'https://example.com/art100x100bb.jpg',
    }],
};

const MOCK_ALBUM_TRACKS = {
    results: [
        { wrapperType: 'artist', artistName: 'Queen' },
        {
            wrapperType: 'track', kind: 'song',
            trackName: 'Bohemian Rhapsody', artistName: 'Queen',
            collectionName: 'A Night at the Opera',
            releaseDate: '1975-10-31T07:00:00Z',
            previewUrl: 'https://example.com/preview.mp3',
        },
    ],
};

const MOCK_ARTIST_SEARCH = {
    results: [{
        wrapperType: 'artist',
        artistId: 77777,
        artistName: 'Queen',
    }],
};

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

// Extracts the JSONP callback name from the URL and wraps the payload.
function itunesFulfill(route, payload) {
    const cb = (route.request().url().match(/[?&]callback=([^&]+)/) ?? [])[1] ?? '_cb';
    return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `${cb}(${JSON.stringify(payload)})`,
    });
}

test.describe('Card Generator', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/itunes.apple.com/search**', route => itunesFulfill(route, MOCK_ITUNES_RESULT));
    });

    test('loads with correct initial state', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page).toHaveTitle('Hitster Card Generator');
        await expect(page.locator('a[href="https://exportify.net"]').first()).toBeVisible();
        await expect(page.locator('#track-input')).toBeVisible();
        await expect(page.locator('#search-btn')).toBeVisible();
        await expect(page.locator('#track-list-section')).toBeHidden();
        await expect(page.locator('#generate-btn')).toBeHidden();
    });

    test('back link navigates to player', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.click('a.back-link');
        await expect(page).toHaveURL(/index\.html|\/$|localhost:8080\/$/);
    });

    test('shows error for empty input', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.click('#search-btn');
        await expect(page.locator('#status-message')).toContainText('upload a CSV or paste');
    });

    test('searches iTunes and renders track list', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#track-input', 'Queen - Bohemian Rhapsody');
        await page.click('#search-btn');

        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#track-tbody tr')).toHaveCount(1);
        await expect(page.locator('#track-tbody')).toContainText('Queen');
        await expect(page.locator('#track-tbody')).toContainText('Bohemian Rhapsody');
        await expect(page.locator('.year-input')).toHaveValue('1975');
        await expect(page.locator('#generate-btn')).toBeVisible();
    });

    test('year filter highlights out-of-range tracks', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#track-input', 'Queen - Bohemian Rhapsody');
        await page.click('#search-btn');
        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 10000 });

        await page.fill('#min-year', '1980');
        await page.fill('#max-year', '2000');
        await page.click('#year-filter-apply');

        await expect(page.locator('#track-tbody tr.out-of-range')).toHaveCount(1);
    });

    test('year filter does not highlight in-range tracks', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#track-input', 'Queen - Bohemian Rhapsody');
        await page.click('#search-btn');
        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 10000 });

        await page.fill('#min-year', '1970');
        await page.fill('#max-year', '1980');
        await page.click('#year-filter-apply');

        await expect(page.locator('#track-tbody tr.out-of-range')).toHaveCount(0);
    });

    test('year is editable in track list', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#track-input', 'Queen - Bohemian Rhapsody');
        await page.click('#search-btn');
        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 10000 });

        await page.fill('.year-input', '1974');
        await page.locator('.year-input').press('Tab');
        await expect(page.locator('.year-input')).toHaveValue('1974');
    });

    test('no-preview track shows warning badge and hides generate button', async ({ page }) => {
        await page.route('**/itunes.apple.com/search**', route => itunesFulfill(route, MOCK_ITUNES_NO_PREVIEW));

        await page.goto('/card-generator.html');
        await page.fill('#track-input', 'Obscure Track - Unknown Artist');
        await page.click('#search-btn');
        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 10000 });

        await expect(page.locator('.badge-warning')).toBeVisible();
        await expect(page.locator('#generate-btn')).toBeHidden();
    });

    test('CSV file upload populates textarea', async ({ page }) => {
        await page.goto('/card-generator.html');

        const csvContent = [
            'Spotify ID,Artist Name(s),Track Name,Album Name,Release Date',
            '1234,Queen,Bohemian Rhapsody,A Night at the Opera,1975-10-31',
        ].join('\n');

        await page.locator('#csv-upload').setInputFiles({
            name: 'playlist.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent),
        });

        await expect(page.locator('#track-input')).toHaveValue(csvContent);
        await expect(page.locator('#status-message')).toContainText('playlist.csv');
    });

    test('parses multiple tracks and renders all rows', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#track-input', 'Queen - Bohemian Rhapsody\nABBA - Dancing Queen\nMichael Jackson - Thriller');
        await page.click('#search-btn');

        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#track-tbody tr')).toHaveCount(3);
    });

    // ── Deezer playlist import ──────────────────────────────────────────────────

    test('imports Deezer playlist and renders tracks', async ({ page }) => {
        await page.route('**/api.deezer.com/**', async route => {
            const cb = (route.request().url().match(/callback=([^&]+)/) ?? [])[1] ?? 'cb';
            await route.fulfill({
                contentType: 'application/javascript',
                body: `${cb}(${JSON.stringify({ data: [{ title: 'Bohemian Rhapsody', artist: { name: 'Queen' } }], next: null })})`,
            });
        });

        await page.goto('/card-generator.html');
        await page.fill('#playlist-url-input', 'https://www.deezer.com/playlist/123456');
        await page.click('#playlist-import-btn');

        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#track-tbody tr')).toHaveCount(1);
        await expect(page.locator('#track-tbody')).toContainText('Bohemian Rhapsody');
    });

    test('shows error for invalid Deezer URL', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#playlist-url-input', 'https://www.example.com/not-a-playlist');
        await page.click('#playlist-import-btn');
        await expect(page.locator('#status-message')).toContainText('not recognised');
    });

    test('shows error when Deezer URL input is empty', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.click('#playlist-import-btn');
        await expect(page.locator('#status-message')).toContainText('Paste a Deezer playlist URL first');
    });

    test('Deezer import triggered by Enter key', async ({ page }) => {
        await page.goto('/card-generator.html');
        await page.fill('#playlist-url-input', 'https://www.example.com/not-a-playlist');
        await page.press('#playlist-url-input', 'Enter');
        await expect(page.locator('#status-message')).toContainText('not recognised');
    });

    // ── iTunes direct search (album / artist tabs) ──────────────────────────────

    test('iTunes album search renders result cards', async ({ page }) => {
        await page.route('**/itunes.apple.com/search**', async route => {
            const url = route.request().url();
            const body = url.includes('entity=album') ? MOCK_ALBUM_SEARCH : MOCK_ITUNES_RESULT;
            await itunesFulfill(route, body);
        });

        await page.goto('/card-generator.html');
        await page.fill('#itunes-search-input', 'Queen');
        await page.click('#itunes-search-btn');

        await expect(page.locator('.result-card')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('.result-name')).toContainText('A Night at the Opera');
        await expect(page.locator('.result-sub')).toContainText('Queen');
    });

    test('clicking iTunes album result imports tracks', async ({ page }) => {
        await page.route('**/itunes.apple.com/search**', async route => {
            const url = route.request().url();
            await itunesFulfill(route, url.includes('entity=album') ? MOCK_ALBUM_SEARCH : MOCK_ITUNES_RESULT);
        });
        await page.route('**/itunes.apple.com/lookup**', async route => {
            await itunesFulfill(route, MOCK_ALBUM_TRACKS);
        });

        await page.goto('/card-generator.html');
        await page.fill('#itunes-search-input', 'Queen');
        await page.click('#itunes-search-btn');
        await expect(page.locator('.result-card')).toBeVisible({ timeout: 10000 });
        await page.locator('.result-card').first().click();

        await expect(page.locator('#track-list-section')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#track-tbody tr')).toHaveCount(1);
        await expect(page.locator('#track-tbody')).toContainText('Bohemian Rhapsody');
    });

    test('iTunes search triggered by Enter key', async ({ page }) => {
        await page.route('**/itunes.apple.com/search**', async route => {
            const url = route.request().url();
            await itunesFulfill(route, url.includes('entity=album') ? MOCK_ALBUM_SEARCH : MOCK_ITUNES_RESULT);
        });

        await page.goto('/card-generator.html');
        await page.fill('#itunes-search-input', 'Queen');
        await page.press('#itunes-search-input', 'Enter');
        await expect(page.locator('.result-card')).toBeVisible({ timeout: 10000 });
    });

    test('iTunes artist tab search renders artist results', async ({ page }) => {
        await page.route('**/itunes.apple.com/search**', async route => {
            const url = route.request().url();
            await itunesFulfill(route, url.includes('entity=musicArtist') ? MOCK_ARTIST_SEARCH : MOCK_ITUNES_RESULT);
        });

        await page.goto('/card-generator.html');
        await page.click('[data-tab="artist"]');
        await page.fill('#itunes-search-input', 'Queen');
        await page.click('#itunes-search-btn');

        await expect(page.locator('.result-card')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('.result-name')).toContainText('Queen');
        await expect(page.locator('.result-sub')).toContainText('Artist');
    });
});
