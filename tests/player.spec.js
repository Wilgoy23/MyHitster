const { test, expect } = require('@playwright/test');

function encodePreviewUrl(url) {
    return Buffer.from(url).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

test.describe('Player page', () => {
    test('loads with correct initial state', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle('MyHitster — Mystery Music');
        await expect(page.locator('#status-message')).toHaveText('Scan a QR code to load a track');
        await expect(page.locator('#play-button')).toBeVisible();
        await expect(page.locator('#scan-button')).toBeVisible();
        await expect(page.locator('#player-wrapper')).toBeHidden();
    });

    test('loads and queues track from preview URL param', async ({ page }) => {
        // Serve real audio so the player doesn't enter preview recovery
        await page.route('**/preview.mp3', route => route.fulfill({
            contentType: 'audio/wav',
            body: silentWav(),
        }));
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

    test('recovers an expired preview via the card registry', async ({ page }) => {
        // Dead preview URL baked into the card
        await page.route('**/dead-preview.mp3', route => route.abort());
        // Card registry lookup returns the track behind the card ID
        await page.route('**/rest/v1/cards**', route => route.fulfill({
            json: [{ id: 'abc123def456', artist: 'Queen', title: 'Bohemian Rhapsody', year: '1975' }],
        }));
        // iTunes re-search returns a fresh preview URL
        await page.route('**/itunes.apple.com/search**', route => route.fulfill({
            json: { results: [{
                trackName: 'Bohemian Rhapsody', artistName: 'Queen',
                releaseDate: '1975-10-31T07:00:00Z',
                previewUrl: 'https://example.com/fresh.mp3',
                collectionName: 'A Night at the Opera',
            }] },
        }));
        // The fresh preview loads fine (minimal silent WAV)
        await page.route('**/fresh.mp3', route => route.fulfill({
            contentType: 'audio/wav',
            body: silentWav(),
        }));

        const encoded = encodePreviewUrl('https://example.com/dead-preview.mp3');
        await page.goto(`/?preview=${encoded}&id=abc123def456`);

        await expect
            .poll(() => page.evaluate(() => audio.src), { timeout: 10000 })
            .toContain('fresh.mp3');
        await expect(page.locator('#status-message')).toHaveText('Tap play to hear the mystery track');
    });
});

// Minimal valid mono 16-bit PCM WAV file (silence).
function silentWav() {
    const sampleRate = 8000, numSamples = 800;
    const dataSize = numSamples * 2;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
    return buf;
}
