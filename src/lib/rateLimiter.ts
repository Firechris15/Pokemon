/**
 * Token-bucket rate limiter. YGOPRODeck allows 20 requests per second and
 * blocks clients that exceed it for an hour, so the app stays well below.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private waiters: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly perSecond: number,
    private readonly burst: number = perSecond,
    private readonly now: () => number = Date.now
  ) {
    this.tokens = burst;
    this.last = now();
  }

  /** Resolves as soon as a request may be sent. */
  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.drain();
    });
  }

  private refill() {
    const now = this.now();
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.perSecond);
  }

  private drain() {
    this.refill();
    while (this.waiters.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      this.waiters.shift()!();
    }
    if (this.waiters.length > 0 && this.timer === null) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.perSecond) * 1000);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain();
      }, waitMs);
    }
  }
}

/** Shared limiter for every request to YGOPRODeck (API and images). */
export const ygoprodeckLimiter = new RateLimiter(8, 8);

type QueueJob = {
  key: string;
  run: () => Promise<void>;
  priority: number;
};

/**
 * Concurrency-limited job queue keyed by string. Jobs with a higher priority
 * run first; among equal priorities the newest job wins (LIFO), so cards that
 * just scrolled into view load before ones that already scrolled past.
 * Queued jobs can be cancelled before they start.
 */
export class JobQueue {
  private queued = new Map<string, QueueJob>();
  private running = new Set<string>();
  private seq = 0;

  constructor(private readonly concurrency: number) {}

  enqueue(key: string, run: () => Promise<void>, priority = 0): void {
    if (this.running.has(key)) return;
    const existing = this.queued.get(key);
    // Re-enqueueing bumps the job to the front of its priority class.
    this.queued.set(key, {
      key,
      run: existing?.run ?? run,
      priority: priority * 1e9 + ++this.seq,
    });
    this.pump();
  }

  cancel(key: string): void {
    this.queued.delete(key);
  }

  isPending(key: string): boolean {
    return this.queued.has(key) || this.running.has(key);
  }

  get size(): number {
    return this.queued.size + this.running.size;
  }

  clear(): void {
    this.queued.clear();
  }

  private pump() {
    while (this.running.size < this.concurrency && this.queued.size > 0) {
      let next: QueueJob | null = null;
      for (const job of this.queued.values()) {
        if (next === null || job.priority > next.priority) next = job;
      }
      if (!next) return;
      const job = next;
      this.queued.delete(job.key);
      this.running.add(job.key);
      job
        .run()
        .catch(() => undefined)
        .finally(() => {
          this.running.delete(job.key);
          this.pump();
        });
    }
  }
}
