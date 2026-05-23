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

test.describe('Card Generator', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/itunes.apple.com/search**', route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_ITUNES_RESULT),
            })
        );
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
        await expect(page.locator('#track-tbody')).toContainText('1975');
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
        await page.route('**/itunes.apple.com/search**', route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_ITUNES_NO_PREVIEW),
            })
        );

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
});
