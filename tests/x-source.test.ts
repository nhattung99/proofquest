import { describe, expect, it } from 'vitest';
import { isXAccountSource } from '../lib/x-quest';
describe('confirmed X endpoint boundary', () => {
  it.each(['https://api.x.com/1.1/account/settings.json', 'https://api.x.com/1.1/account/settings.json?include_mention_filter=true'])('accepts %s', url => expect(isXAccountSource(url)).toBe(true));
  it.each(['https://api.x.com.evil.example/1.1/account/settings.json', 'https://api.x.com/1.1/account/settings.json.evil', 'http://api.x.com/1.1/account/settings.json', 'https://user@api.x.com/1.1/account/settings.json', 'https://api.x.com/1.1/account/settings.json#fragment', 'https://x.com/home', 'https://api.x.com:8443/1.1/account/settings.json'])('rejects %s', url => expect(isXAccountSource(url)).toBe(false));
});
