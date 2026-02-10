export type ActorType = 'user' | 'api_key' | 'service' | 'system';

export type EventCategory =
  | 'auth'
  | 'access'
  | 'mutation'
  | 'admin'
  | 'security'
  | 'system';

export interface Actor {
  id: string;
  type: ActorType;
  name?: string;
  email?: string;
}

export interface Target {
  id: string;
  type: string;
  name?: string;
}

export interface Change {
  field: string;
  before: unknown;
  after: unknown;
}

export interface EventContext {
  ip_address?: string;
  user_agent?: string;
  location?: string;
  session_id?: string;
}

export interface EventInput {
  action: string;
  category: EventCategory;
  actor: Actor;
  tenant_id: string;
  target?: Target;
  context?: EventContext;
  metadata?: Record<string, unknown>;
  changes?: Change[];
  idempotency_key?: string;
  occurred_at?: string;
}

export interface LogStitchOptions {
  projectKey: string;
  baseUrl?: string;
  batchSize?: number;
  flushInterval?: number;
  maxQueueSize?: number;
  strict?: boolean;
  onError?: (error: Error) => void;
}

export interface EventListParams {
  tenant_id?: string;
  actor_id?: string;
  actor_type?: ActorType;
  action?: string;
  category?: EventCategory;
  target_id?: string;
  target_type?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface EventResponse {
  id: string;
  action: string;
  category: EventCategory;
  actor: Actor;
  tenant_id: string;
  target?: Target;
  context?: EventContext;
  metadata?: Record<string, unknown>;
  changes?: Change[];
  content_hash: string;
  idempotency_key?: string;
  occurred_at: string;
  received_at: string;
}

export interface EventListResponse {
  events: EventResponse[];
  cursor: string | null;
  has_more: boolean;
  request_id: string;
}

export interface IngestResponse {
  ids: string[];
  redacted_count: number;
  request_id: string;
}

export interface ViewerTokenParams {
  tenant_id: string;
  tier?: string;
  expires_in?: number;
}

export interface ViewerTokenResponse {
  token: string;
  expires_at: string;
  request_id: string;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
}
