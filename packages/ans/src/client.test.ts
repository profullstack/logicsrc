import { describe, expect, it, vi } from 'vitest';
import { AnsClient } from './client.js';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body) } as unknown as Response;
}

describe('AnsClient', () => {
  it('resolves a name and decodes the base64 receipt', async () => {
    const receiptB64 = btoa(String.fromCharCode(0xd2, 0x84, 0x40));
    const fetchMock = vi.fn(async () => jsonResponse({
      name: 'ans://v1.0.0.my-agent.example.com',
      endpoint: 'https://my-agent.example.com',
      capabilities: ['chat'],
      receipt: receiptB64,
    }));

    const client = new AnsClient({ registryUrl: 'https://registry.ans.dev/', fetch: fetchMock as unknown as typeof fetch });
    const id = await client.resolve('ans://v1.0.0.my-agent.example.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.ans.dev/v1/resolve/ans%3A%2F%2Fv1.0.0.my-agent.example.com',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(id.name.agent).toBe('my-agent');
    expect(id.capabilities).toEqual(['chat']);
    expect([...id.receipt.cbor]).toEqual([0xd2, 0x84, 0x40]);
  });

  it('register applies the DNS challenge via the supplied applier', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ challengeToken: 'tok-xyz', recordName: '_ans-challenge.my-agent.example.com' }));
    const upsertTxt = vi.fn(async () => {});

    const client = new AnsClient({ registryUrl: 'https://registry.ans.dev', token: 't', fetch: fetchMock as unknown as typeof fetch });
    const reg = await client.register({ agent: 'my-agent', domain: 'example.com', version: '1.0.0', verify: 'dns', dns: { upsertTxt } });

    expect(reg.name.raw).toBe('ans://v1.0.0.my-agent.example.com');
    expect(reg.challenge).toEqual({ type: 'TXT', name: '_ans-challenge.my-agent.example.com', value: 'tok-xyz' });
    expect(upsertTxt).toHaveBeenCalledWith({ name: '_ans-challenge.my-agent.example.com', value: 'tok-xyz' });
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer t' });
  });

  it('throws on a non-OK response', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => 'no such name' } as unknown as Response));
    const client = new AnsClient({ registryUrl: 'https://registry.ans.dev', fetch: fetchMock as unknown as typeof fetch });
    await expect(client.resolve('ans://v1.0.0.ghost.example.com')).rejects.toThrow('ANS GET /v1/resolve/');
  });
});
