# @logstitch/sdk

TypeScript SDK for [LogStitch](https://logstitch.io) — enterprise-grade audit logs for your SaaS.

Zero runtime dependencies. 3.6KB minified. ESM + CJS.

## Install

```bash
npm install @logstitch/sdk
```

## Quick Start

```typescript
import { LogStitch } from '@logstitch/sdk';

const client = new LogStitch({
  projectKey: 'pk_...',
});

// Send an event (fire-and-forget by default)
await client.log({
  action: 'user.invited',
  category: 'mutation',
  tenant_id: 'tenant_abc',
  actor: { id: 'user_123', type: 'user', name: 'Alice' },
  target: { id: 'user_456', type: 'user', name: 'Bob' },
  metadata: { role: 'editor' },
});

// Flush pending events before shutdown
await client.close();
```

## Sending Events

### Single Event

`client.log(event)` queues an event for batched delivery. Events are automatically batched and flushed based on the configured `batchSize` and `flushInterval`.

```typescript
await client.log({
  action: 'document.shared',
  category: 'mutation',
  tenant_id: 'tenant_abc',
  actor: { id: 'user_123', type: 'user' },
  target: { id: 'doc_789', type: 'document', name: 'Q4 Report' },
  changes: [
    { field: 'visibility', before: 'private', after: 'team' },
  ],
  context: {
    ip_address: '203.0.113.1',
    user_agent: 'Mozilla/5.0...',
  },
});
```

### Batch Send

`client.logBatch(events)` sends events immediately without queuing and returns the response.

```typescript
const result = await client.logBatch([
  {
    action: 'user.created',
    category: 'mutation',
    tenant_id: 'tenant_abc',
    actor: { id: 'system', type: 'system' },
  },
  {
    action: 'user.role_assigned',
    category: 'admin',
    tenant_id: 'tenant_abc',
    actor: { id: 'system', type: 'system' },
    target: { id: 'user_456', type: 'user' },
  },
]);

console.log(result.ids); // ['evt_01J...', 'evt_01J...']
```

## Querying Events

```typescript
const response = await client.events.list({
  tenant_id: 'tenant_abc',
  action: 'user.invited',
  category: 'mutation',
  start_date: '2025-01-01T00:00:00Z',
  limit: 50,
});

console.log(response.events);   // EventResponse[]
console.log(response.has_more); // boolean
console.log(response.cursor);   // string | null

// Paginate
if (response.has_more) {
  const next = await client.events.list({
    tenant_id: 'tenant_abc',
    cursor: response.cursor!,
  });
}
```

### Query Parameters

| Parameter     | Type     | Description                          |
|---------------|----------|--------------------------------------|
| `tenant_id`   | `string` | Filter by tenant                     |
| `actor_id`    | `string` | Filter by actor ID                   |
| `actor_type`  | `string` | Filter by actor type                 |
| `action`      | `string` | Filter by action name                |
| `category`    | `string` | Filter by category                   |
| `target_id`   | `string` | Filter by target ID                  |
| `target_type` | `string` | Filter by target type                |
| `start_date`  | `string` | ISO 8601 start date                  |
| `end_date`    | `string` | ISO 8601 end date                    |
| `search`      | `string` | Full-text search                     |
| `cursor`      | `string` | Cursor for pagination                |
| `limit`       | `number` | Max results per page (default 50)    |

## Viewer Tokens

Generate short-lived tokens for the [`@logstitch/viewer`](https://www.npmjs.com/package/@logstitch/viewer) embeddable component. Viewer tokens are scoped to a single tenant and enforce read-only access.

```typescript
const { token, expires_at } = await client.viewerTokens.create({
  tenant_id: 'tenant_abc',
  expires_in: 3600, // seconds (default: 3600, max: 86400)
});

// Pass `token` to the <LogViewer /> component in your frontend
```

## Configuration

```typescript
const client = new LogStitch({
  // Required
  projectKey: 'pk_...',

  // Optional
  baseUrl: 'https://logstitch.io',  // API base URL
  batchSize: 10,                      // Events per batch (default: 10)
  flushInterval: 5000,                // Flush timer in ms (default: 5000)
  maxQueueSize: 1000,                 // Max queued events (default: 1000)
  strict: false,                      // Throw on errors (default: false)
  onError: (err) => console.error(err), // Error callback (fire-and-forget mode)
});
```

## Batching & Retry

Events sent via `client.log()` are queued and flushed automatically when either:

- The queue reaches `batchSize` events, or
- The `flushInterval` timer fires

If the queue reaches `maxQueueSize`, new events are dropped silently.

Call `client.flush()` to flush manually, or `client.close()` to flush and stop the timer (e.g. before process exit).

### Retry Behavior

All HTTP requests use exponential backoff with jitter:

- **3 attempts** by default
- **500ms** base delay, **30s** max delay
- **4xx errors** are not retried (client errors)
- **5xx errors** and network failures are retried

## Error Handling

### Fire-and-Forget (default)

Errors from `client.log()` are swallowed. Use `onError` to observe them:

```typescript
const client = new LogStitch({
  projectKey: 'pk_...',
  onError: (err) => {
    // Log to your monitoring service
    Sentry.captureException(err);
  },
});
```

### Strict Mode

Set `strict: true` to throw on any error. Useful for `logBatch()` and direct API calls:

```typescript
import { LogStitch, LogStitchError } from '@logstitch/sdk';

const client = new LogStitch({
  projectKey: 'pk_...',
  strict: true,
});

try {
  await client.logBatch([event]);
} catch (err) {
  if (err instanceof LogStitchError) {
    console.error(err.code);      // 'validation_error'
    console.error(err.status);    // 422
    console.error(err.requestId); // 'req_01J...'
  }
}
```

## Event Schema

```typescript
interface EventInput {
  action: string;                          // e.g. 'user.invited'
  category: 'auth' | 'access' | 'mutation' | 'admin' | 'security' | 'system';
  actor: {
    id: string;
    type: 'user' | 'api_key' | 'service' | 'system';
    name?: string;
    email?: string;
  };
  tenant_id: string;
  target?: { id: string; type: string; name?: string };
  context?: { ip_address?: string; user_agent?: string; location?: string; session_id?: string };
  metadata?: Record<string, unknown>;
  changes?: Array<{ field: string; before: unknown; after: unknown }>;
  idempotency_key?: string;               // Auto-generated if omitted
  occurred_at?: string;                    // ISO 8601, defaults to now
}
```

## License

MIT
