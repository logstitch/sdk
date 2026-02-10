import type { RetryOptions } from './types.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY = 500;
const DEFAULT_MAX_DELAY = 30_000;

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = opts?.baseDelay ?? DEFAULT_BASE_DELAY;
  const maxDelay = opts?.maxDelay ?? DEFAULT_MAX_DELAY;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        await sleep(getDelay(attempt, baseDelay, maxDelay));
        continue;
      }
      throw lastError;
    }

    if (res.ok || (res.status >= 400 && res.status < 500)) {
      return res;
    }

    // 5xx — retry
    lastError = new Error(`HTTP ${res.status}`);
    if (attempt < maxAttempts - 1) {
      await sleep(getDelay(attempt, baseDelay, maxDelay));
    }
  }

  throw lastError ?? new Error('fetchWithRetry: exhausted retries');
}

function getDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponential = baseDelay * 2 ** attempt;
  const capped = Math.min(exponential, maxDelay);
  const jitter = capped * Math.random();
  return capped + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
