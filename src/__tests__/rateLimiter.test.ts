import { JobQueue, RateLimiter } from '@/lib/rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('never exceeds the configured rate', async () => {
    let now = 0;
    const limiter = new RateLimiter(5, 5, () => now);
    const granted: number[] = [];
    for (let i = 0; i < 12; i++) limiter.acquire().then(() => granted.push(now));

    await Promise.resolve();
    expect(granted).toHaveLength(5); // burst

    for (let t = 0; t < 2000; t += 50) {
      now += 50;
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    }
    expect(granted).toHaveLength(12);
    // After the burst, at most 5 per second.
    const afterBurst = granted.slice(5);
    expect(afterBurst[afterBurst.length - 1]).toBeGreaterThanOrEqual(1400);
  });
});

describe('JobQueue', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('limits concurrency and runs newest jobs first', async () => {
    const queue = new JobQueue(1);
    const order: string[] = [];
    const gate = deferred();
    queue.enqueue('a', async () => {
      order.push('a');
      await gate.promise;
    });
    queue.enqueue('b', async () => void order.push('b'));
    queue.enqueue('c', async () => void order.push('c'));
    expect(order).toEqual(['a']);
    gate.resolve();
    await flush();
    await flush();
    expect(order).toEqual(['a', 'c', 'b']);
  });

  it('runs higher priority first and supports cancelling', async () => {
    const queue = new JobQueue(1);
    const order: string[] = [];
    const gate = deferred();
    queue.enqueue('busy', () => gate.promise);
    queue.enqueue('low', async () => void order.push('low'), 0);
    queue.enqueue('high', async () => void order.push('high'), 1);
    queue.enqueue('gone', async () => void order.push('gone'), 1);
    queue.cancel('gone');
    gate.resolve();
    await flush();
    await flush();
    expect(order).toEqual(['high', 'low']);
    expect(queue.size).toBe(0);
  });

  it('does not run the same key twice while pending', async () => {
    const queue = new JobQueue(2);
    let runs = 0;
    const gate = deferred();
    queue.enqueue('x', async () => {
      runs++;
      await gate.promise;
    });
    queue.enqueue('x', async () => void runs++);
    expect(queue.isPending('x')).toBe(true);
    gate.resolve();
    await flush();
    expect(runs).toBe(1);
  });
});
