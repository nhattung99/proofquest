export const X_QUEST = {
  id: 'verify-x-account',
  title: 'Verify Your X Account',
  templateId: '2e3160ae-8b1e-45e3-8c59-426366278b9d',
  dataSourceUrl: 'https://x.com/home',
  requestUrl: 'https://api.x.com/1.1/account/settings.json',
  field: 'screen_name',
  jsonPath: '$.screen_name',
} as const;

// The Hub's trailing .* is not permission to accept arbitrary URL suffixes.
// Permit the exact endpoint with optional query parameters, never other paths/hosts.
export function isXAccountSource(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'api.x.com' &&
      url.port === '' && url.username === '' && url.password === '' &&
      url.pathname === '/1.1/account/settings.json' && url.hash === '';
  } catch { return false; }
}
