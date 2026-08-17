import { handleGmailScan } from '../../src/gmail/gmailScan';

jest.mock('../../src/lib/auth', () => ({
  verifyIdToken: jest.fn(() => Promise.resolve('alice')),
}));

jest.mock('../../src/gmail/processGmailMessage', () => ({
  extractReceiptFromMessage: jest.fn(() => Promise.resolve({ rawLabel: 'Spotify Premium', rawCategory: 'Media' })),
}));

test('creates one stagingItem per matched receipt email', async () => {
  const stagingItems: any[] = [];
  const fakeDb: any = { collection: () => ({ add: async (data: any) => { stagingItems.push(data); return { id: 'x' }; } }) };
  const fakeGmailClient: any = {
    listMessages: async () => [{ id: 'msg1', subject: 'Your Spotify receipt', snippet: '...' }],
    getMessageBody: async () => 'Thanks for being a Spotify subscriber.',
  };
  const fakeOpenai: any = {};

  const result = await handleGmailScan(fakeDb, fakeOpenai, fakeGmailClient, 'alice');

  expect(result.stagingItemsCreated).toBe(1);
  expect(stagingItems).toHaveLength(1);
  expect(stagingItems[0].rawLabel).toBe('Spotify Premium');
  expect(stagingItems[0].createdBy).toBe('alice');
  expect(stagingItems[0].collector).toBe('gmail');
});
