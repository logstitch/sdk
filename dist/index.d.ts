type ActorType = 'user' | 'api_key' | 'service' | 'system';
type EventCategory = 'auth' | 'access' | 'mutation' | 'admin' | 'security' | 'system';
interface Actor {
    id: string;
    type: ActorType;
    name?: string;
    email?: string;
}
interface Target {
    id: string;
    type: string;
    name?: string;
}
interface Change {
    field: string;
    before: unknown;
    after: unknown;
}
interface EventContext {
    ip_address?: string;
    user_agent?: string;
    location?: string;
    session_id?: string;
}
interface EventInput {
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
interface LogStitchOptions {
    projectKey: string;
    baseUrl?: string;
    batchSize?: number;
    flushInterval?: number;
    maxQueueSize?: number;
    strict?: boolean;
    onError?: (error: Error) => void;
}
interface EventListParams {
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
interface EventResponse {
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
interface EventListResponse {
    events: EventResponse[];
    cursor: string | null;
    has_more: boolean;
    request_id: string;
}
interface IngestResponse {
    ids: string[];
    redacted_count: number;
    request_id: string;
}
interface ViewerTokenParams {
    tenant_id: string;
    tier?: string;
    expires_in?: number;
}
interface ViewerTokenResponse {
    token: string;
    expires_at: string;
    request_id: string;
}

declare class LogStitch {
    private readonly baseUrl;
    private readonly projectKey;
    private readonly strict;
    private readonly onError?;
    private readonly queue;
    readonly events: {
        list: (params?: EventListParams) => Promise<EventListResponse>;
    };
    readonly viewerTokens: {
        create: (params: ViewerTokenParams) => Promise<ViewerTokenResponse>;
    };
    constructor(options: LogStitchOptions);
    log(event: EventInput): Promise<void>;
    logBatch(events: EventInput[]): Promise<IngestResponse>;
    flush(): Promise<void>;
    close(): Promise<void>;
    private _send;
    private _sendAndReturn;
    private _listEvents;
    private _createViewerToken;
    private _handleError;
}

declare class LogStitchError extends Error {
    readonly status: number;
    readonly code: string;
    readonly requestId: string;
    constructor(message: string, status: number, code: string, requestId: string);
    static fromResponse(res: Response): Promise<LogStitchError>;
}

export { type Actor, type ActorType, type Change, type EventCategory, type EventContext, type EventInput, type EventListParams, type EventListResponse, type EventResponse, type IngestResponse, LogStitch, LogStitchError, type LogStitchOptions, type Target, type ViewerTokenParams, type ViewerTokenResponse };
