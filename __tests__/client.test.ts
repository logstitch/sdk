import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogStitch } from '../src/client.js';
import { LogStitchError } from '../src/errors.js';
import type { EventInput } from '../src/types.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEvent(overrides?: Partial<EventInput>): EventInput {
  return {
    action: 'user.created',
    category: 'mutation',
    actor: { id: 'usr_1', type: 'user' },
    tenant_id: 'tenant_1',
    ...overrides,
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LogStitch', () => {
  it('throws if projectKey is missing', () => {
    expect(() => new LogStitch({ projectKey: '' })).toThrow('projectKey is required');
  });

  describe('log()', () => {
    it('enqueues event and flushes on batch size', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(201, { ids: ['evt_1'], redacted_count: 0, request_id: 'req_1' }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
        batchSize: 2,
        flushInterval: 60_000,
      });

      await client.log(makeEvent());
      await client.log(makeEvent());
      await vi.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test/api/v1/events');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer pk_live_test' }),
      );
    });

    it('swallows errors in non-strict mode and calls onError', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse(400, {
            error: { code: 'validation_error', message: 'bad' },
            request_id: 'req_1',
          }),
        ),
      );

      const onError = vi.fn();
      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
        batchSize: 1,
        flushInterval: 60_000,
        onError,
        strict: false,
      });

      await client.log(makeEvent());
      // batch size triggers async flush
      await vi.advanceTimersByTimeAsync(0);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![0]).toBeInstanceOf(LogStitchError);
    });

    it('throws errors in strict mode on logBatch()', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse(400, {
            error: { code: 'validation_error', message: 'bad input' },
            request_id: 'req_1',
          }),
        ),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
        strict: true,
      });

      await expect(client.logBatch([makeEvent()])).rejects.toThrow(LogStitchError);
    });
  });

  describe('logBatch()', () => {
    it('sends events immediately bypassing queue', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(201, {
          ids: ['evt_1', 'evt_2'],
          redacted_count: 0,
          request_id: 'req_1',
        }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
        batchSize: 100, // high batch size so queue wouldn't flush
      });

      const result = await client.logBatch([makeEvent(), makeEvent()]);
      expect(result.ids).toEqual(['evt_1', 'evt_2']);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      // idempotency_key should be auto-generated
      expect(body[0].idempotency_key).toBeDefined();
    });

    it('sends single event unwrapped', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(201, {
          ids: ['evt_1'],
          redacted_count: 0,
          request_id: 'req_1',
        }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
      });

      await client.logBatch([makeEvent()]);
      const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
      // Single event should be sent as object, not array
      expect(body.action).toBe('user.created');
    });

    it('throws LogStitchError on API error', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse(400, {
            error: { code: 'validation_error', message: 'bad input' },
            request_id: 'req_1',
          }),
        ),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
      });

      await expect(client.logBatch([makeEvent()])).rejects.toThrow(LogStitchError);

      try {
        await client.logBatch([makeEvent()]);
      } catch (err) {
        expect(err).toBeInstanceOf(LogStitchError);
        const lsErr = err as LogStitchError;
        expect(lsErr.code).toBe('validation_error');
        expect(lsErr.status).toBe(400);
        expect(lsErr.requestId).toBe('req_1');
      }
    });
  });

  describe('events.list()', () => {
    it('sends GET request with query params', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(200, {
          events: [],
          cursor: null,
          has_more: false,
          request_id: 'req_1',
        }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
      });

      const result = await client.events.list({
        tenant_id: 'tenant_1',
        action: 'user.created',
        limit: 20,
      });

      expect(result.events).toEqual([]);
      expect(result.has_more).toBe(false);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('tenant_id')).toBe('tenant_1');
      expect(parsed.searchParams.get('action')).toBe('user.created');
      expect(parsed.searchParams.get('limit')).toBe('20');
    });

    it('sends GET request without query params when none provided', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(200, {
          events: [],
          cursor: null,
          has_more: false,
          request_id: 'req_1',
        }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
      });

      await client.events.list();
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test/api/v1/events');
    });

    it('omits undefined params', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(200, {
          events: [],
          cursor: null,
          has_more: false,
          request_id: 'req_1',
        }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
      });

      await client.events.list({ tenant_id: 'tenant_1', action: undefined });
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.has('action')).toBe(false);
      expect(parsed.searchParams.get('tenant_id')).toBe('tenant_1');
    });
  });

  describe('flush() and close()', () => {
    it('flush() sends queued events', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(201, { ids: ['evt_1'], redacted_count: 0, request_id: 'req_1' }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
        batchSize: 100,
        flushInterval: 60_000,
      });

      await client.log(makeEvent());
      expect(mockFetch).not.toHaveBeenCalled();

      await client.flush();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('close() flushes and stops', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(201, { ids: ['evt_1'], redacted_count: 0, request_id: 'req_1' }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test',
        batchSize: 100,
        flushInterval: 60_000,
      });

      await client.log(makeEvent());
      await client.close();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('baseUrl handling', () => {
    it('strips trailing slashes from baseUrl', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(200, { events: [], cursor: null, has_more: false, request_id: 'req_1' }),
      );

      const client = new LogStitch({
        projectKey: 'pk_live_test',
        baseUrl: 'https://api.test///',
      });

      await client.events.list();
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test/api/v1/events');
    });
  });
});
