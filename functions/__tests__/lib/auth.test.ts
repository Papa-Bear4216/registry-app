import { verifyIdToken } from '../../src/lib/auth';

jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: jest.fn((token: string) => {
      if (token === 'valid-token') return Promise.resolve({ uid: 'alice' });
      return Promise.reject(new Error('invalid token'));
    }),
  }),
}));

test('returns uid for a valid Bearer token', async () => {
  const uid = await verifyIdToken('Bearer valid-token');
  expect(uid).toBe('alice');
});

test('throws for a missing Authorization header', async () => {
  await expect(verifyIdToken(undefined)).rejects.toThrow('Missing Authorization header');
});

test('throws for a malformed Authorization header (no Bearer prefix)', async () => {
  await expect(verifyIdToken('valid-token')).rejects.toThrow('Malformed Authorization header');
});

test('throws for an invalid/expired token', async () => {
  await expect(verifyIdToken('Bearer bad-token')).rejects.toThrow('invalid token');
});
