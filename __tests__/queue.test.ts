import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchQueue } from '../src/queue.js';
import type { EventInput } from '../src/types.js';

function makeEvent(overrides?: Partial<EventInput>): EventInput {
  return {
    action: 'user.created',
    category: 'mutation',
    actor: { id: 'usr_1', type: 'user' },
    tenant_id: 'tenant_1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BatchQueue', () => {
  it('enqueues events and reports size', () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new BatchQueue({
      batchSize: 10,
      flushInterval: 5000,
      maxQueueSize: 100,
      onFlush,
    });

    queue.enqueue(makeEvent());
    queue.enqueue(makeEvent());
    expect(queue.size).toBe(2);
  });

  it('auto-generates idempotency_key', async () => {
    const flushed: EventInput[][] = [];
    const onFlush = vi.fn().mockImplementation((events: EventInput[]) => {
      flushed.push(events);
      return Promise.resolve();
    });

    const queue = new BatchQueue({
      batchSize: 1,
      flushInterval: 5000,
      maxQueueSize: 100,
      onFlush,
    });

    queue.enqueue(makeEvent());
    await vi.advanceTimersByTimeAsync(0);

    expect(flushed[0]![0]!.idempotency_key).toBeDefined();
    expect(typeof flushed[0]![0]!.idempotency_key).toBe('string');
  });

  it('preserves existing idempotency_key', async () => {
    const flushed: EventInput[][] = [];
    const onFlush = vi.fn().mockImplementation((events: EventInput[]) => {
      flushed.push(events);
      return Promise.resolve();
    });

    const queue = new BatchQueue({
      batchSize: 1,
      flushInterval: 5000,
      maxQueueSize: 100,
      onFlush,
    });

    queue.enqueue(makeEvent({ idempotency_key: 'my-key' }));
    await vi.advanceTimersByTimeAsync(0);

    expect(flushed[0]![0]!.idempotency_key).toBe('my-key');
  });

  it('flushes when batch size is reached', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new BatchQueue({
      batchSize: 3,
      flushInterval: 60_000,
      maxQueueSize: 100,
      onFlush,
    });

    queue.enqueue(makeEvent());
    queue.enqueue(makeEvent());
    queue.enqueue(makeEvent());
    await vi.advanceTimersByTimeAsync(0);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ action: 'user.created' }),
    ]));
    expect(queue.size).toBe(0);
  });

  it('flushes on timer interval', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new BatchQueue({
      batchSize: 100,
      flushInterval: 1000,
      maxQueueSize: 100,
      onFlush,
    });

    queue.enqueue(makeEvent());
    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('drops events when maxQueueSize exceeded', () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new BatchQueue({
      batchSize: 100,
      flushInterval: 60_000,
      maxQueueSize: 2,
      onFlush,
    });

    queue.enqueue(makeEvent());
    queue.enqueue(makeEvent());
    queue.enqueue(makeEvent()); // should be dropped

    expect(queue.size).toBe(2);
  });

  it('close() flushes remaining events and stops timer', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new BatchQueue({
      batchSize: 100,
      flushInterval: 60_000,
      maxQueueSize: 100,
      onFlush,
    });

    queue.enqueue(makeEvent());
    queue.enqueue(makeEvent());
    await queue.close();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it('flush() is a no-op when queue is empty', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new BatchQueue({
      batchSize: 10,
      flushInterval: 5000,
      maxQueueSize: 100,
      onFlush,
    });

    await queue.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });
});
