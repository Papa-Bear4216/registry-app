import * as admin from 'firebase-admin';

export async function verifyIdToken(authHeader: string | undefined): Promise<string> {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Malformed Authorization header');
  }
  const token = authHeader.slice('Bearer '.length);
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}
