import { afterEach, expect, it, vi } from 'vitest';
import { createCustomerReadQueue } from '@/lib/customer-read-queue';
import { createClientReadCache } from '@/lib/client-read-cache';

const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

it('opens a different customer while an unrelated background read is stalled', async () => {
  const queue = createCustomerReadQueue();
  let release!: (value: string) => void;
  const background = queue.read('background', () => new Promise<string>(resolve => { release = resolve; }), false);
  await tick();
  // The reserved foreground slot does not depend on the stalled request.
  expect(await queue.read('selected', async () => 'selected data')).toBe('selected data');
  release('background data');
  await background;
});

it('inherits the remaining timeout when selecting the customer already being prefetched', async () => {
  vi.useFakeTimers();
  const queue = createCustomerReadQueue();
  const fetcher = vi.fn(() => new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error('simulated read timeout')), 15_000);
  }));
  const cache = createClientReadCache(fetcher);
  const background = queue.read('same', () => cache.load('same'), false);
  const backgroundResult = background.catch(error => error.message);
  await tick();
  await vi.advanceTimersByTimeAsync(5_000);
  const foregroundRun = vi.fn(() => cache.load('same'));
  const clicked = queue.read('same', foregroundRun);
  const clickedResult = clicked.catch(error => error.message);
  let settled = false;
  void clickedResult.then(() => { settled = true; });
  queue.cancel('same'); // Panel-open cleanup cannot abort running reads.
  await vi.advanceTimersByTimeAsync(9_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await clickedResult).toBe('simulated read timeout');
  expect(await backgroundResult).toBe('simulated read timeout');
  expect(clicked).toBe(background);
  expect(foregroundRun).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
  // A later explicit retry works after the failed pending read is removed.
  expect(await queue.read('same', async () => 'retry data')).toBe('retry data');
});

it('still shares the pending transport if only the queue key is changed', async () => {
  const queue = createCustomerReadQueue();
  let release!: (value: string) => void;
  const fetcher = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
  const cache = createClientReadCache(fetcher);
  const background = queue.read('background-key', () => cache.load('customer'), false);
  await tick();
  const clicked = queue.read('foreground-key', () => cache.load('customer'));
  await tick();
  expect(fetcher).toHaveBeenCalledOnce();
  release('same authorized data');
  expect(await clicked).toBe('same authorized data');
  await background;
});

it('queues a click behind two unfinished intent-prefetch jobs marked foreground', async () => {
  const queue = createCustomerReadQueue();
  const releases: Array<() => void> = [];
  const hold = () => new Promise<void>(resolve => { releases.push(resolve); });
  // Current steam hover/focus prefetch uses readDetail(id)'s default true.
  const first = queue.read('hover-a', hold, true);
  const second = queue.read('hover-b', hold, true);
  await tick();
  const selectedRun = vi.fn(async () => 'selected');
  const selected = queue.read('selected-c', selectedRun, true);
  await tick();
  expect(selectedRun).not.toHaveBeenCalled();
  releases[0]();
  expect(await selected).toBe('selected');
  releases[1]();
  await Promise.all([first, second]);
});
