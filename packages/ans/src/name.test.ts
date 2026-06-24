import { describe, expect, it } from 'vitest';
import { formatAnsName, parseAnsName } from './name.js';

describe('parseAnsName', () => {
  it('parses a well-formed ans:// name', () => {
    expect(parseAnsName('ans://v1.0.0.my-agent.example.com')).toEqual({
      raw: 'ans://v1.0.0.my-agent.example.com',
      version: '1.0.0',
      agent: 'my-agent',
      domain: 'example.com',
    });
  });

  it('parses multi-label domains and prerelease versions', () => {
    const parsed = parseAnsName('ans://v2.3.1-beta.bot.agents.example.co.uk');
    expect(parsed.version).toBe('2.3.1-beta');
    expect(parsed.agent).toBe('bot');
    expect(parsed.domain).toBe('agents.example.co.uk');
  });

  it.each([
    'https://v1.0.0.a.example.com',
    'ans://1.0.0.a.example.com',
    'ans://v1.0.a.example.com',
    'ans://v1.0.0.bad agent.example.com',
    'ans://v1.0.0.agent',
  ])('rejects malformed name %s', (raw) => {
    expect(() => parseAnsName(raw)).toThrow();
  });

  it('round-trips through formatAnsName', () => {
    expect(formatAnsName({ version: '1.2.3', agent: 'a', domain: 'example.com' })).toBe('ans://v1.2.3.a.example.com');
  });
});
