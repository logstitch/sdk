import type {
  EventInput,
  EventListParams,
  EventListResponse,
  IngestResponse,
  LogStitchOptions,
  ViewerTokenParams,
  ViewerTokenResponse,
} from './types.js';
import type { StreamOptions } from './stream.js';
import { LogStitchError } from './errors.js';
import { fetchWithRetry } from './retry.js';
import { BatchQueue } from './queue.js';

const DEFAULT_BASE_URL = 'https://logstitch.io';
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL = 5_000;
const DEFAULT_MAX_QUEUE_SIZE = 1_000;

export class LogStitch {
  private readonly baseUrl: string;
  private readonly projectKey: string;
  private readonly strict: boolean;
  private readonly onError?: (error: Error) => void;
  private readonly queue: BatchQueue;
  private readonly mode: 'authenticated' | 'stream';
  private readonly streamToken: string | null;

  readonly events: {
    list: (params?: EventListParams) => Promise<EventListResponse>;
  };

  readonly viewerTokens: {
    create: (params: ViewerTokenParams) => Promise<ViewerTokenResponse>;
  };

  /**
   * Create a stream-mode client for anonymous event ingestion.
   * No API key or signup required. Events are sent to a claim token endpoint.
   * Call `client.token` to get the claim token for later account binding.
   */
  static stream(options?: StreamOptions): LogStitch {
    const token = options?.token ?? crypto.randomUUID();
    const instance = new LogStitch({
      projectKey: '__stream__',
      baseUrl: options?.baseUrl,
      batchSize: options?.batchSize,
      flushInterval: options?.flushInterval,
      maxQueueSize: options?.maxQueueSize,
      strict: options?.strict,
      onError: options?.onError,
    }, { mode: 'stream', streamToken: token });

    const baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    // eslint-disable-next-line no-console
    console.log(`LogStitch Stream Mode — Claim at: ${baseUrl}/claim?token=${token}`);

    return instance;
  }

  /** Get the stream claim token (null in authenticated mode). */
  get token(): string | null {
    return this.streamToken;
  }

  constructor(
    options: LogStitchOptions,
    internal?: { mode: 'stream'; streamToken: string },
  ) {
    this.mode = internal?.mode ?? 'authenticated';
    this.streamToken = internal?.streamToken ?? null;

    if (this.mode === 'authenticated' && !options.projectKey) {
      throw new Error('LogStitch: projectKey is required');
    }

    this.projectKey = options.projectKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.strict = options.strict ?? false;
    this.onError = options.onError;

    this.queue = new BatchQueue({
      batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
      flushInterval: options.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
      maxQueueSize: options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      onFlush: (events) => this._send(events),
    });

    if (this.mode === 'stream') {
      this.events = {
        list: () => { throw new Error('LogStitch: events.list() is not available in stream mode'); },
      };
      this.viewerTokens = {
        create: () => { throw new Error('LogStitch: viewerTokens.create() is not available in stream mode'); },
      };
    } else {
      this.events = {
        list: (params) => this._listEvents(params),
      };
      this.viewerTokens = {
        create: (params) => this._createViewerToken(params),
      };
    }
  }

  async log(event: EventInput): Promise<void> {
    try {
      this.queue.enqueue(event);
    } catch (err) {
      this._handleError(err);
    }
  }

  async logBatch(events: EventInput[]): Promise<IngestResponse> {
    const enriched = events.map((e) =>
      e.idempotency_key ? e : { ...e, idempotency_key: crypto.randomUUID() },
    );
    return this._sendAndReturn(enriched);
  }

  async flush(): Promise<void> {
    await this.queue.flush();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  private async _send(events: EventInput[]): Promise<void> {
    try {
      await this._sendAndReturn(events);
    } catch (err) {
      this._handleError(err);
    }
  }

  private async _sendAndReturn(events: EventInput[]): Promise<IngestResponse> {
    const url = this.mode === 'stream'
      ? `${this.baseUrl}/api/v1/streams/${this.streamToken}/events`
      : `${this.baseUrl}/api/v1/events`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.mode === 'authenticated') {
      headers['Authorization'] = `Bearer ${this.projectKey}`;
    }

    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(events.length === 1 ? events[0] : events),
      },
    );

    if (!res.ok) {
      throw await LogStitchError.fromResponse(res);
    }

    return (await res.json()) as IngestResponse;
  }

  private async _listEvents(params?: EventListParams): Promise<EventListResponse> {
    const qs = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          qs.set(key, String(value));
        }
      }
    }

    const query = qs.toString();
    const url = `${this.baseUrl}/api/v1/events${query ? `?${query}` : ''}`;

    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.projectKey}`,
      },
    });

    if (!res.ok) {
      throw await LogStitchError.fromResponse(res);
    }

    return (await res.json()) as EventListResponse;
  }

  private async _createViewerToken(params: ViewerTokenParams): Promise<ViewerTokenResponse> {
    const res = await fetchWithRetry(
      `${this.baseUrl}/api/v1/viewer-tokens`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.projectKey}`,
        },
        body: JSON.stringify(params),
      },
    );

    if (!res.ok) {
      throw await LogStitchError.fromResponse(res);
    }

    return (await res.json()) as ViewerTokenResponse;
  }

  private _handleError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    if (this.strict) {
      throw error;
    }
    this.onError?.(error);
  }
}
