import { test, expect, type Page } from '@playwright/test';
import { Wallet, utils } from 'ethers';
import { mkdirSync } from 'node:fs';

// Synthetic MetaMask provider; real ECDSA signatures and actual auth routes.
// No successful Primus attestation or X binding is simulated.
async function walletBrowser(page: Page, reject = false) {
  const signer = Wallet.createRandom();
  await page.exposeFunction('pqFixtureSign', (hex: string) => signer.signMessage(utils.arrayify(hex)));
  await page.addInitScript(({ address, reject }) => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    let accounts = [address];
    const provider = {
      isMetaMask: true,
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return accounts;
        if (method === 'eth_chainId') return '0x1';
        if (method === 'personal_sign') {
          if (reject) throw { code: 4001 };
          return (window as unknown as { pqFixtureSign(hex: unknown): Promise<string> }).pqFixtureSign(params![0]);
        }
        throw new Error('Unsupported fixture method');
      },
      on: (event: string, listener: (...args: unknown[]) => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); },
      removeListener: (event: string, listener: (...args: unknown[]) => void) => listeners.get(event)?.delete(listener),
    };
    Object.assign(window, { ethereum: provider, pqFixtureChange: () => { accounts = ['0x2222222222222222222222222222222222222222']; for (const listener of listeners.get('accountsChanged') ?? []) listener(accounts); } });
    window.primus = {};
    window.addEventListener('message', event => {
      if (event.data?.name === 'initAttestation') window.postMessage({ target: 'padoZKAttestationJSSDK', name: 'initAttestationRes', params: { result: true, data: { padoExtensionVersion: 'fixture' } } }, '*');
    });
  }, { address: signer.address, reject });
  await page.route('**/api/poc/config', route => route.fulfill({ json: { appId: 'synthetic-app' } }));
  await page.goto('/');
  return signer;
}
test('MetaMask EOA login is server verified, survives reload, and logout revokes the session', async ({ page }) => {
  const signer = await walletBrowser(page);
  await page.getByRole('button', { name: 'Login MetaMask' }).click();
  await expect(page.getByRole('button', { name: 'Verify & bind X' })).toBeEnabled();
  const session = await page.request.get('/api/poc/wallet/session');
  expect(await session.json()).toMatchObject({ address: signer.address, chainId: 1, link: null });
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/proofquest-wallet-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/proofquest-wallet-mobile.png', fullPage: true });
  const cookies = await page.context().cookies();
  expect(cookies.find(cookie => cookie.name === 'proofquest_wallet')).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
  // Inspect only the public signed request recipient. No real attestation is generated.
  const issued = await page.evaluate(async address => {
    const response = await fetch('/api/poc/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bind: true, address, chainId: 1 }) });
    const result = await response.json();
    return { status: response.status, recipient: result.signedRequest ? JSON.parse(result.signedRequest).attRequest.userAddress : null };
  }, signer.address);
  expect(issued).toEqual({ status: 200, recipient: signer.address });
  await page.evaluate(() => fetch('/api/poc/cancel', { method: 'POST' }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Verify & bind X' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Login MetaMask' })).toBeEnabled();
  expect(await (await page.request.get('/api/poc/wallet/session')).json()).toEqual({ address: null });
});
test('changing MetaMask accounts signs out and removes binding controls', async ({ page }) => {
  await walletBrowser(page);
  await page.getByRole('button', { name: 'Login MetaMask' }).click();
  await expect(page.getByRole('button', { name: 'Verify & bind X' })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { pqFixtureChange(): void }).pqFixtureChange());
  await expect(page.getByRole('button', { name: 'Login MetaMask' })).toBeEnabled();
  await expect(page.locator('.wallet-notice')).toContainText('account or network changed');
  expect(await (await page.request.get('/api/poc/wallet/session')).json()).toEqual({ address: null });
});
test('declined MetaMask signature never creates an authenticated session', async ({ page }) => {
  await walletBrowser(page, true);
  await page.getByRole('button', { name: 'Login MetaMask' }).click();
  await expect(page.locator('.wallet-notice')).toContainText('declined');
  await expect(page.getByRole('button', { name: 'Login MetaMask' })).toBeEnabled();
  expect(await (await page.request.get('/api/poc/wallet/session')).json()).toEqual({ address: null });
});
test('changing accounts during X verification cancels progression and requires a clean SDK reset', async ({ page }) => {
  await walletBrowser(page);
  await page.route('**/public/app/quote**', route => route.fulfill({ json: { rc: 0, result: { remainingQuota: 1 } } }));
  await page.getByRole('button', { name: 'Login MetaMask' }).click();
  await expect(page.getByRole('button', { name: 'Verify & bind X' })).toBeEnabled();
  await page.getByRole('button', { name: 'Verify & bind X' }).click();
  await expect(page.locator('.progress-panel')).toBeVisible();
  await page.evaluate(() => (window as unknown as { pqFixtureChange(): void }).pqFixtureChange());
  await expect(page.locator('.cancel-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset connection & retry' })).toBeEnabled();
  await expect(page.locator('.success-receipt')).toHaveCount(0);
  expect(await (await page.request.get('/api/poc/wallet/session')).json()).toEqual({ address: null });
});
test('wallet login waits for configuration cookie bootstrap to finish', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/poc/config', async route => { await pending; await route.fulfill({ json: { appId: 'synthetic-app' } }); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Login MetaMask' })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: 'Login MetaMask' })).toBeEnabled();
});
