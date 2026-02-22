export interface StreamOptions {
  /** Existing claim token to resume. If omitted, generates a new UUIDv4. */
  token?: string;
  baseUrl?: string;
  batchSize?: number;
  flushInterval?: number;
  maxQueueSize?: number;
  strict?: boolean;
  onError?: (error: Error) => void;
}
