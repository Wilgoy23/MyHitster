const { test, expect } = require('@playwright/test');

// Minimal supabase-js UMD mock — satisfies auth.js and decks.js without real network calls
const SUPABASE_UMD_MOCK = `
window.supabase = {
    createClient: function(url, key) {
        return {
            auth: {
                onAuthStateChange: function(cb) {
                    return { data: { subscription: { unsubscribe: function() {} } } };
                },
                getSession: function() {
                    return Promise.resolve({ data: { session: null }, error: null });
                },
                signInWithPassword: function() {
                    return Promise.resolve({ data: {}, error: null });
                },
                signUp: function() {
                    return Promise.resolve({ data: {}, error: null });
                },
                signOut: function() {
                    return Promise.resolve({ error: null });
                },
                signInWithOAuth: function() {
                    return Promise.resolve({ error: null });
                },
            },
            from: function() {
                return { select: function() { return { order: function() { return Promise.resolve({ data: [], error: null }); } }; } };
            },
            storage: { from: function() { return {}; } },
        };
    }
};
`;

// Stub config so tests don't depend on a local config.js being present
const CONFIG_MOCK = `
export const SUPABASE_URL = 'https://example.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.stub';
`;

test.describe('Auth widget', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js', async route => {
            await route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_UMD_MOCK });
        });
        await page.route('**/js/config.js', async route => {
            await route.fulfill({ status: 200, contentType: 'application/javascript', body: CONFIG_MOCK });
        });
    });

    test('sign-in button is visible when Supabase is configured', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page.locator('#auth-open-modal')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#auth-open-modal')).toHaveText('Sign in');
    });

    test('auth modal opens when sign-in button is clicked', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page.locator('#auth-open-modal')).toBeVisible({ timeout: 5000 });
        await page.click('#auth-open-modal');
        await expect(page.locator('#auth-modal')).toBeVisible();
        await expect(page.locator('#auth-panel-signin')).toBeVisible();
    });

    test('auth modal closes when X button is clicked', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page.locator('#auth-open-modal')).toBeVisible({ timeout: 5000 });
        await page.click('#auth-open-modal');
        await expect(page.locator('#auth-modal')).toBeVisible();
        await page.click('#auth-modal-close');
        await expect(page.locator('#auth-modal')).not.toBeVisible();
    });

    test('auth modal closes when overlay is clicked', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page.locator('#auth-open-modal')).toBeVisible({ timeout: 5000 });
        await page.click('#auth-open-modal');
        await expect(page.locator('#auth-modal')).toBeVisible();
        // Click the overlay edge (not the inner modal box)
        await page.locator('#auth-modal').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#auth-modal')).not.toBeVisible();
    });

    test('sign-up tab switches to sign-up panel', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page.locator('#auth-open-modal')).toBeVisible({ timeout: 5000 });
        await page.click('#auth-open-modal');
        await page.click('[data-tab="signup"]');
        await expect(page.locator('#auth-panel-signup')).not.toHaveClass(/hidden/);
        await expect(page.locator('#auth-panel-signin')).toHaveClass(/hidden/);
    });

    test('switching back to sign-in tab restores sign-in panel', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page.locator('#auth-open-modal')).toBeVisible({ timeout: 5000 });
        await page.click('#auth-open-modal');
        await page.click('[data-tab="signup"]');
        await page.click('[data-tab="signin"]');
        await expect(page.locator('#auth-panel-signin')).not.toHaveClass(/hidden/);
        await expect(page.locator('#auth-panel-signup')).toHaveClass(/hidden/);
    });

    test('deck toolbar is hidden when not logged in', async ({ page }) => {
        await page.goto('/card-generator.html');
        await expect(page.locator('#deck-toolbar')).toBeHidden();
    });
});
