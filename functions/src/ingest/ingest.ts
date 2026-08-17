import { Firestore } from 'firebase-admin/firestore';
import { Request } from 'firebase-functions/v2/https';
import { Response } from 'express';
import { verifyIdToken } from '../lib/auth';
import { findOrCreateDeviceSource } from './deviceSource';
import { CollectorType } from '../types/enums';

interface IngestBody {
  collector: CollectorType;
  sourceId: string;
  sourceLabel: string;
  rawLabel: string;
  rawCategory?: string;
  rawIdentity?: string;
  idempotencyKey: string;
  payload: {
    usageCount: number;
    usageDurationMs: number;
    windowHours: number;
  };
}

function isValidBody(body: any): body is IngestBody {
  return (
    typeof body?.collector === 'string' &&
    typeof body?.sourceId === 'string' &&
    typeof body?.sourceLabel === 'string' &&
    typeof body?.rawLabel === 'string' &&
    typeof body?.idempotencyKey === 'string' &&
    body.idempotencyKey.length > 0 &&
    typeof body?.payload === 'object' &&
    typeof body?.payload?.usageCount === 'number' &&
    typeof body?.payload?.usageDurationMs === 'number' &&
    typeof body?.payload?.windowHours === 'number'
  );
}

export async function handleIngest(db: Firestore, req: Request, res: Response): Promise<void> {
  let uid: string;
  try {
    uid = await verifyIdToken(req.headers.authorization as string | undefined);
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'Unauthorized' });
    return;
  }

  if (!isValidBody(req.body)) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const body = req.body;
  const now = new Date().toISOString();

  const existing = await db
    .collection('observations')
    .where('createdBy', '==', uid)
    .where('idempotencyKey', '==', body.idempotencyKey)
    .limit(1)
    .get();

  if (!existing.empty) {
    // Already ingested — this is a retry of a partially-failed batch.
    // Returning 200 here (not re-writing) keeps the worker's retry loop
    // simple: every record in the batch either succeeds or is confirmed
    // already-succeeded, with no duplicate stagingItems/observations pair.
    res.status(200).json({ ok: true, deduped: true });
    return;
  }

  const deviceSourceId = await findOrCreateDeviceSource(db, uid, body.sourceId, body.collector, body.sourceLabel);

  const stagingRef = await db.collection('stagingItems').add({
    rawLabel: body.rawLabel,
    rawCategory: body.rawCategory ?? null,
    rawIdentity: body.rawIdentity ?? null,
    payloadSnapshot: JSON.stringify(body.payload),
    collector: body.collector,
    sourceId: body.sourceId,
    capturedAt: now,
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: null,
    createdBy: uid,
  });

  await db.collection('observations').add({
    registryItemId: null,
    stagingItemId: stagingRef.id,
    deviceSourceId,
    idempotencyKey: body.idempotencyKey,
    collector: body.collector,
    observedAt: now,
    windowHours: body.payload.windowHours,
    usageCount: body.payload.usageCount,
    usageDurationMs: body.payload.usageDurationMs,
    createdBy: uid,
  });

  res.status(200).json({ ok: true });
}
