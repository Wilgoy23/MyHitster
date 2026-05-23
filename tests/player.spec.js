const { test, expect } = require('@playwright/test');

function encodePreviewUrl(url) {
    return Buffer.from(url).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

test.describe('Player page', () => {
    test('loads with correct initial state', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle('Mystery Music Player');
        await expect(page.locator('#status-message')).toHaveText('Scan a QR code to load a track');
        await expect(page.locator('#play-button')).toBeVisible();
        await expect(page.locator('#scan-button')).toBeVisible();
        await expect(page.locator('#player-wrapper')).toBeHidden();
    });

    test('loads and queues track from preview URL param', async ({ page }) => {
        const encoded = encodePreviewUrl('https://example.com/preview.mp3');
        await page.goto(`/?preview=${encoded}&id=abc123`);

        await expect(page.locator('#status-message')).toHaveText('Tap play to hear the mystery track');
        await expect(page.locator('#mystery-id')).toHaveText('Mystery Track #abc123');
        await expect(page.locator('#player-wrapper')).toBeVisible();
    });

    test('shows legacy message for old Spotify track= format', async ({ page }) => {
        await page.goto('/?track=c3BvdGlmeTp0cmFjazoxMjM');
        await expect(page.locator('#status-message')).toContainText('older version');
    });

    test('footer link navigates to card generator', async ({ page }) => {
        await page.goto('/');
        await page.click('a[href="card-generator.html"]');
        await expect(page).toHaveURL(/card-generator/);
    });
});
