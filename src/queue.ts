import type { EventInput } from './types.js';

export type FlushCallback = (events: EventInput[]) => Promise<void>;

export class BatchQueue {
  private queue: EventInput[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly maxQueueSize: number;
  private readonly onFlush: FlushCallback;
  private flushing = false;

  constructor(opts: {
    batchSize: number;
    flushInterval: number;
    maxQueueSize: number;
    onFlush: FlushCallback;
  }) {
    this.batchSize = opts.batchSize;
    this.flushInterval = opts.flushInterval;
    this.maxQueueSize = opts.maxQueueSize;
    this.onFlush = opts.onFlush;
  }

  enqueue(event: EventInput): void {
    if (this.queue.length >= this.maxQueueSize) {
      return; // drop event — queue full
    }

    if (!event.idempotency_key) {
      event = { ...event, idempotency_key: crypto.randomUUID() };
    }

    this.queue.push(event);
    this.startTimer();

    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;

    this.flushing = true;
    const batch = this.queue.splice(0);
    try {
      await this.onFlush(batch);
    } finally {
      this.flushing = false;
    }
  }

  async close(): Promise<void> {
    this.stopTimer();
    await this.flush();
  }

  get size(): number {
    return this.queue.length;
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushInterval);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
