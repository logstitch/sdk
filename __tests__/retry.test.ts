import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWithRetry } from '../src/retry.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchWithRetry', () => {
  it('returns response on 200', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('https://example.com', {});
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns 4xx without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(400, { error: 'bad' }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('https://example.com', {});
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 and succeeds', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('https://example.com', {}, {
      baseDelay: 1,
      maxAttempts: 3,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on 500', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, {}));
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithRetry('https://example.com', {}, {
        maxAttempts: 2,
        baseDelay: 1,
      }),
    ).rejects.toThrow('HTTP 500');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network error and succeeds', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('https://example.com', {}, {
      baseDelay: 1,
    });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on network error after exhausting retries', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error('network failure'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      fetchWithRetry('https://example.com', {}, {
        maxAttempts: 2,
        baseDelay: 1,
      }),
    ).rejects.toThrow('network failure');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
