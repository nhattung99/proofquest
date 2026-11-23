import { test, expect } from '@playwright/test';
test('unconfigured harness fails closed and explains its status on mobile', async ({ page }) => {
  await page.route('**/api/poc/config', route => route.fulfill({ status: 503, json: { error: 'Unconfigured test fixture' } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Verify Your X Account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeDisabled();
  await expect(page.locator('.setup-text')).toContainText('Setup required');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('missing extension is reported (configuration response is mocked, no proof)', async ({ page }) => {
  await page.route('**/api/poc/config', route => route.fulfill({ json: { appId: 'synthetic-app' } }));
  await page.goto('/');
  await expect(page.locator('.setup-text')).toContainText('extension is missing');
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeDisabled();
});
test('proof routes refuse unauthenticated/unconfigured requests', async ({ request }) => {
  expect((await request.post('/api/poc/request')).status()).toBe(400);
  expect((await request.post('/api/poc/verify', { data: { success: true } })).status()).toBe(400);
});
test('bundled SDK does not log extension initialization payloads (synthetic transport only)', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', message => messages.push(message.text()));
  await page.route('**/api/poc/config', route => route.fulfill({ json: { appId: 'synthetic-app' } }));
  await page.addInitScript(() => {
    window.primus = {};
    window.addEventListener('message', event => {
      if (event.data?.name === 'initAttestation') {
        setTimeout(() => window.postMessage({ target: 'padoZKAttestationJSSDK', name: 'initAttestationRes', params: { result: true, data: { padoExtensionVersion: 'synthetic-sensitive-marker' } } }, '*'), 0);
      }
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeEnabled();
  expect(messages.join('\n')).not.toContain('synthetic-sensitive-marker');
  expect(messages.join('\n')).not.toContain('sdk receive');
  // No proof button click, attestation generation, or successful proof is mocked.
});
