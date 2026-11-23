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
  await expect(page.locator('.cancel-notice')).toContainText('cancelled');
  await expect(page.getByRole('button', { name: 'Reset connection & retry' })).toBeEnabled();
  expect(revocations).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.error-callout')).toHaveCount(0);
  await expect(page.locator('.success-receipt')).toHaveCount(0);
});
test('mobile remains within viewport and exposes extension install guidance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/poc/config', route => route.fulfill({ json: { appId: 'synthetic-app' } }));
  await page.goto('/');
  await expect(page.locator('.extension-pill')).toContainText('not detected');
  await expect(page.getByRole('link', { name: 'Install Primus extension' })).toBeVisible();
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
test('unconfigured public verification explains service setup without local-only copy', async ({ page }) => {
  await page.route('**/api/poc/config', route => route.fulfill({ status: 503, json: { code: 'PQ_CONFIG' } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeDisabled();
  await expect(page.locator('.setup-text')).toContainText('not configured');
  await expect(page.locator('body')).not.toContainText('Local verification only');
});
test('expanded technical details wrap fully on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByText('Technical details', { exact: true }).click();
  await expect(page.locator('.card-bottom details p')).toContainText('Signing secrets stay on the server.');
  expect(await page.locator('.card-bottom details p').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('rate-limit rejection shows a friendly message instead of a raw error', async ({ page }) => {
  await ready(page);
  await page.route('**/api/poc/request', route => route.fulfill({ status: 429, headers: { 'Retry-After': '3600' }, json: { code: 'PQ_RATE_LIMIT' } }));
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.locator('.error-callout')).toContainText('Too many attempts');
  await expect(page.locator('.error-callout')).toContainText('Wait for the rate limit to reset');
});

for (const viewport of [{ width: 1438, height: 789 }, { width: 1150, height: 631 }, { width: 1024, height: 600 }]) {
  test(`full primary action fits short desktop ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const button = await page.getByRole('button', { name: 'Generate real proof' }).boundingBox();
    expect(button!.y).toBeGreaterThanOrEqual(0);
    expect(button!.y + button!.height).toBeLessThan(viewport.height - 12);
  });
}

// Synthetic transport tests never create or accept a mock proof.
async function pendingExtension(page: Page) {
  await page.route('**/api/poc/request', route => route.fulfill({ json: { signedRequest: JSON.stringify({ attRequest: { appId: 'synthetic-app', attTemplateID: 'synthetic-template', userAddress: '0x1111111111111111111111111111111111111111', timestamp: 1, timeout: 200000 }, appSignature: 'synthetic-unused-signature' }) } }));
  await page.route('**/public/app/quote**', route => route.fulfill({ json: { rc: 0, result: { remainingQuota: 1 } } }));
  await page.route('**/api/poc/cancel', route => route.fulfill({ json: { cancelled: true } }));
}

test('extension marker without handshake cannot show detected or completed steps', async ({ page }) => {
  await page.route('**/api/poc/config', route => route.fulfill({ json: { appId: 'synthetic-app' } }));
  await page.addInitScript(() => {
    window.primus = {};
    window.addEventListener('message', event => { if (event.data?.name === 'initAttestation') document.documentElement.dataset.sdkInit = '1'; });
  });
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.extension-pill')).toContainText('checking');
  await expect(page.locator('.journey li.done')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-sdk-init', '1');
  await page.clock.fastForward(13000);
  await expect(page.locator('.error-callout')).toContainText('PQ_TIMEOUT');
  await expect(page.getByRole('button', { name: 'Reset connection & retry' }).first()).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Install Primus extension' })).toBeVisible();
});

test('no extension acknowledgement times out instead of hanging and retry cleans the SDK realm', async ({ page }) => {
  await ready(page);
  await pendingExtension(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.locator('.progress-panel')).toBeVisible();
  await expect(page.locator('.journey li.done')).toHaveCount(1);
  await page.clock.fastForward(16000);
  await expect(page.locator('.error-callout')).toContainText('PQ_EXTENSION_LAUNCH');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset connection & retry' }).first().click();
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeEnabled();
  await expect(page.locator('.error-callout')).toContainText('PQ_EXTENSION_LAUNCH');
  await expect(page.locator('.error-callout')).not.toContainText('PQ_INTERRUPTED');
});

test('cancel during pending attestation unlocks immediately and does not punish reload', async ({ page }) => {
  await ready(page);
  await pendingExtension(page);
  let submissions = 0;
  await page.route('**/api/poc/verify', route => { submissions++; return route.fulfill({ status: 400, json: { code: 'PQ_PAYLOAD' } }); });
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.locator('.progress-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel verification' }).click();
  await expect(page.getByRole('button', { name: 'Reset connection & retry' })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('proofquest-pending'))).toBeNull();
  await page.getByRole('button', { name: 'Reset connection & retry' }).click();
  await expect(page.getByRole('button', { name: 'Generate real proof' })).toBeEnabled();
  await expect(page.locator('.cancel-notice')).toBeVisible();
  await expect(page.locator('.error-callout')).toHaveCount(0);
  expect(submissions).toBe(0);
});

test('rate countdown survives reload and unlocks only after Retry-After', async ({ page }) => {
  await ready(page);
  await page.clock.install();
  await page.route('**/api/poc/request', route => route.fulfill({ status: 429, headers: { 'Retry-After': '5' }, json: { code: 'PQ_RATE_LIMIT' } }));
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.getByRole('timer')).toContainText('00:00:05');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeDisabled();
  await page.clock.fastForward(6000);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
});

test('acknowledged extension flow still has an overall timeout', async ({ page }) => {
  await ready(page);
  await pendingExtension(page);
  await page.evaluate(() => window.addEventListener('message', event => {
    if (event.data?.name === 'startAttestation') {
      document.documentElement.dataset.proofStarted = '1';
      window.postMessage({ target: 'padoZKAttestationJSSDK', name: 'getAttestationRes', params: { result: true } }, '*');
    }
  }));
  await page.clock.install();
  await page.getByRole('button', { name: 'Generate real proof' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-proof-started', '1');
  await page.clock.fastForward(151000);
  await expect(page.locator('.error-callout')).toContainText('PQ_TIMEOUT');
  await expect(page.getByRole('button', { name: 'Reset connection & retry' }).first()).toBeEnabled();
  await expect(page.locator('.success-receipt')).toHaveCount(0);
});
