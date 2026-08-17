import { extractReceiptFromMessage } from '../../src/gmail/processGmailMessage';

test('extracts a plausible subscription name from a receipt-like email', async () => {
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ rawLabel: 'Spotify Premium', rawCategory: 'Media' }) } }],
    }) } },
  };
  const result = await extractReceiptFromMessage(fakeOpenai, 'Your Spotify Premium subscription renewed', 'Thanks for being a Spotify subscriber. $10.99 charged.');
  expect(result).toEqual({ rawLabel: 'Spotify Premium', rawCategory: 'Media' });
});

test('returns null when the email is not actually a subscription receipt', async () => {
  const fakeOpenai: any = {
    chat: { completions: { create: async () => ({
      choices: [{ message: { content: JSON.stringify({ rawLabel: null, rawCategory: null }) } }],
    }) } },
  };
  const result = await extractReceiptFromMessage(fakeOpenai, 'Weekly Newsletter', 'Here is your weekly digest of articles.');
  expect(result).toBeNull();
});
