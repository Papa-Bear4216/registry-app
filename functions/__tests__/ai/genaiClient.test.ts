import { ApiError } from '@google/genai';
import { callJsonMode } from '../../src/ai/genaiClient';

// Real timers would make this test take ~seconds per retry — the backoff
// schedule itself isn't what's under test, so fake them out.
jest.useFakeTimers();

async function runWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
  // Attach a no-op rejection handler immediately so an eventual rejection
  // doesn't surface as an unhandled rejection warning while timers advance.
  promise.catch(() => {});
  await jest.runAllTimersAsync();
  return promise;
}

test('callJsonMode retries on 429 and eventually returns the successful response', async () => {
  let callCount = 0;
  const fakeGenai: any = {
    models: {
      generateContent: async () => {
        callCount++;
        if (callCount < 3) throw new ApiError({ message: 'rate limited', status: 429 });
        return { text: JSON.stringify({ ok: true }) };
      },
    },
  };

  const result = await runWithFakeTimers(callJsonMode(fakeGenai, 'system', 'user'));

  expect(result).toEqual({ ok: true });
  expect(callCount).toBe(3);
});

test('callJsonMode does not retry a non-429 error', async () => {
  let callCount = 0;
  const fakeGenai: any = {
    models: {
      generateContent: async () => {
        callCount++;
        throw new ApiError({ message: 'bad request', status: 400 });
      },
    },
  };

  await expect(callJsonMode(fakeGenai, 'system', 'user')).rejects.toThrow('bad request');
  expect(callCount).toBe(1);
});

test('callJsonMode gives up and throws after exhausting retries on persistent 429', async () => {
  let callCount = 0;
  const fakeGenai: any = {
    models: {
      generateContent: async () => {
        callCount++;
        throw new ApiError({ message: 'rate limited', status: 429 });
      },
    },
  };

  await expect(runWithFakeTimers(callJsonMode(fakeGenai, 'system', 'user'))).rejects.toThrow('rate limited');
  // MAX_RETRIES=4 means 5 total attempts (initial + 4 retries)
  expect(callCount).toBe(5);
});
