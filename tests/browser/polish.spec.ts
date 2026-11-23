import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Isolated UI fixtures: only initialization/signing responses are simulated.
// No mocked attestation is represented as a genuine Primus proof.
async function ready(page: Page) {
  await page.route('**/api/poc/config', route => route.fulfill({ json: { appId: 'synthetic-app' } }));
  await page.addInitScript(() => {
    window.primus = {};
    window.addEventListener('message', event => {
      if (event.data?.name === 'initAttestation') setTimeout(() => window.postMessage({ target: 'padoZKAttestationJSSDK', name: 'initAttestationRes', params: { result: true, data: { padoExtensionVersion: 'synthetic' } } }, '*'), 0);
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeEnabled();
}
test('desktop action fits first screen and UUID is hidden by default', async ({ page }) => {
  await page.setViewportSize({ width: 1438, height: 789 });
  await ready(page);
  await expect(page.locator('.extension-pill')).toContainText('detected');
  const button = await page.getByRole('button', { name: 'Generate real proof' }).boundingBox();
  expect(button!.y + button!.height).toBeLessThan(789);
  await page.getByRole('button', { name: 'Generate real proof' }).focus();
  expect(await page.getByRole('button', { name: 'Generate real proof' }).evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.getByRole('heading', { name: 'Verify Your X Account' }).click();
  await expect(page.getByText('Template:', { exact: false })).not.toBeVisible();
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/proofquest-desktop.png', fullPage: true });
});
test('error supports copy, dismissal and retry without exposing raw data', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await page.route('**/api/poc/request', route => route.fulfill({ status: 400, json: { code: 'PQ_CONDITIONS' } }));
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.locator('.error-callout')).toContainText('PQ_CONDITIONS');
  await expect(page.getByRole('button', { name: 'Copy error code' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy error code' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('PQ_CONDITIONS');
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/proofquest-error.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await expect(page.locator('.error-callout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.locator('.error-callout')).toBeVisible();
});
test('cancellation during signing ignores late response and revokes attempt', async ({ page }) => {
  await ready(page);
  let revocations = 0;
  await page.route('**/api/poc/cancel', route => { revocations++; return route.fulfill({ json: { cancelled: true } }); });
  await page.route('**/api/poc/request', async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.fulfill({ json: { signedRequest: 'synthetic-unused-request' } });
  });
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.getByRole('button', { name: 'Verification in progress…' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel verification' }).click();
  await expect(page.locator('.cancel-notice')).toContainText('cancelled locally');
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeEnabled();
  expect(revocations).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.error-callout')).toHaveCount(0);
  await expect(page.locator('.success-receipt')).toHaveCount(0);
});
test('mobile remains within viewport and exposes extension install guidance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/poc/config', route => route.fulfill({ json: { appId: 'synthetic-app' } }));
  await page.goto('/');
  await expect(page.locator('.extension-pill')).toContainText('not detected');
  await expect(page.getByRole('link', { name: 'Install ↗' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/proofquest-mobile.png', fullPage: true });
});
test('an interrupted page reload surfaces an explicit error instead of silent idle', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('proofquest-pending', '1'));
  await ready(page);
  await expect(page.locator('.error-callout')).toContainText('PQ_INTERRUPTED');
  await expect(page.locator('.error-callout')).toContainText('page reloaded');
});
test('public preview explains local-only verification without requesting credentials', async ({ page }) => {
  await page.route('**/api/poc/config', route => route.fulfill({ status: 503, json: { code: 'PQ_LOCAL_ONLY' } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Local verification only' })).toBeDisabled();
  await expect(page.locator('.setup-text')).toContainText('Public preview');
  await expect(page.locator('.setup-text')).not.toContainText('.env.local');
});
