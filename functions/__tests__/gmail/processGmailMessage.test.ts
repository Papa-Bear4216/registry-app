import { extractReceiptFromMessage } from '../../src/gmail/processGmailMessage';

test('extracts a plausible subscription name from a receipt-like email', async () => {
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ rawLabel: 'Spotify Premium', rawCategory: 'Media' }),
    }) },
  };
  const result = await extractReceiptFromMessage(fakeGenai, 'Your Spotify Premium subscription renewed', 'Thanks for being a Spotify subscriber. $10.99 charged.');
  expect(result).toEqual({ rawLabel: 'Spotify Premium', rawCategory: 'Media' });
});

test('returns null when the email is not actually a subscription receipt', async () => {
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ rawLabel: null, rawCategory: null }),
    }) },
  };
  const result = await extractReceiptFromMessage(fakeGenai, 'Weekly Newsletter', 'Here is your weekly digest of articles.');
  expect(result).toBeNull();
});

test('throws on a malformed AI response (rawLabel is a number instead of string/null)', async () => {
  const fakeGenai: any = {
    models: { generateContent: async () => ({
      text: JSON.stringify({ rawLabel: 123, rawCategory: 'Media' }),
    }) },
  };
  await expect(
    extractReceiptFromMessage(fakeGenai, 'Your Spotify Premium subscription renewed', 'Thanks for being a subscriber.')
  ).rejects.toThrow('Malformed extraction response from AI');
});
