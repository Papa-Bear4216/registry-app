import { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { CollectorType } from '../types/enums';
import { StagingItem, WorkflowStep } from '../types/models';

/**
 * Maps known Android package names to human-readable application labels.
 */
export function formatPackageLabel(packageName: string): string {
  if (!packageName || typeof packageName !== 'string') {
    return 'Unknown App';
  }
  const clean = packageName.trim();
  const known: Record<string, string> = {
    'com.google.android.apps.messaging': 'Google Messages',
    'com.google.android.calendar': 'Google Calendar',
    'com.google.android.gm': 'Gmail',
    'com.google.android.apps.docs': 'Google Docs',
    'com.google.android.apps.bard': 'Google Gemini',
    'com.android.chrome': 'Google Chrome',
    'com.spotify.music': 'Spotify',
    'com.slack': 'Slack',
    'com.todoist': 'Todoist',
    'com.whatsapp': 'WhatsApp',
    'com.samsung.android.dialer': 'Samsung Dialer',
    'com.sec.android.daemonapp': 'Samsung Weather',
    'com.termux': 'Termux',
    'com.codespaceapps.listeningapp': 'Listening App',
    'us.zoom.videomeetings': 'Zoom Meetings',
  };

  if (known[clean]) {
    return known[clean];
  }

  // Fallback: take the final segment and title-case it
  const parts = clean.split('.');
  const last = parts[parts.length - 1] || clean;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export interface WorkflowSuggestionPayload {
  createdBy: string;
  fromPackage: string;
  toPackage: string;
  title?: string;
  evidenceCount?: number;
  confidence?: number;
  estimatedSecondsSaved?: number;
  reason?: string;
  generatedBy?: string;
  createdAt?: number | string;
  status?: string;
}

/**
 * Transforms an on-device Gemini Nano workflow suggestion from Gut-Instinct
 * into a stagingItem visible in SecondGuess React Native Staging screen.
 */
export async function promoteWorkflowSuggestion(
  db: Firestore,
  suggestionId: string,
  data: WorkflowSuggestionPayload
): Promise<StagingItem | null> {
  if (!data.fromPackage || !data.toPackage || !data.createdBy) {
    return null;
  }

  const stagingItemId = `suggestion-${suggestionId}`;
  const stagingDocRef = db.collection('stagingItems').doc(stagingItemId);
  const existing = await stagingDocRef.get();

  if (existing.exists) {
    return existing.data() as StagingItem;
  }

  const fromLabel = formatPackageLabel(data.fromPackage);
  const toLabel = formatPackageLabel(data.toPackage);
  const workflowTitle = data.title?.trim() || `${fromLabel} ➔ ${toLabel}`;
  const nowIso = new Date().toISOString();

  let capturedAtIso: string;
  if (typeof data.createdAt === 'number') {
    capturedAtIso = new Date(data.createdAt).toISOString();
  } else if (typeof data.createdAt === 'string' && data.createdAt.length > 0) {
    capturedAtIso = data.createdAt;
  } else {
    capturedAtIso = nowIso;
  }

  const confidence = typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.9;
  const estimatedSeconds = typeof data.estimatedSecondsSaved === 'number' && data.estimatedSecondsSaved > 0
    ? data.estimatedSecondsSaved
    : 90;

  const steps: WorkflowStep[] = [
    { order: 1, label: fromLabel, target: data.fromPackage, delayMs: 120, type: 'app_launch' },
    { order: 2, label: toLabel, target: data.toPackage, delayMs: 120, type: 'app_launch' },
  ];

  const stagingItem: StagingItem = {
    id: stagingItemId,
    rawLabel: workflowTitle,
    workflowTitle,
    rawCategory: 'productivity',
    rawIdentity: `${data.fromPackage}->${data.toPackage}`,
    payloadSnapshot: JSON.stringify({
      fromPackage: data.fromPackage,
      toPackage: data.toPackage,
      evidenceCount: data.evidenceCount ?? 3,
      reason: data.reason ?? '',
      generatedBy: data.generatedBy ?? 'gemini-nano',
    }),
    collector: CollectorType.PhoneUsage,
    sourceId: 'gut_instinct_nano',
    sourceSuggestionId: suggestionId,
    capturedAt: capturedAtIso,
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    // Setting classifiedAt immediately surfaces the item in useStagingItems without needing cloud AI
    classifiedAt: nowIso,
    classifiedKind: 'app',
    classifiedCategory: 'productivity',
    classifiedActive: true,
    classifiedConfidence: confidence,
    classifiedDescription: data.reason || `Observed recurring habit: ${fromLabel} ➔ ${toLabel} with ${data.evidenceCount ?? 3} verified transitions.`,
    triggerDescription: `Observed transition from ${fromLabel} to ${toLabel}`,
    actionType: 'multi_step',
    actionPayload: `${data.fromPackage} -> ${data.toPackage}`,
    estimatedSecondsSaved: estimatedSeconds,
    steps,
    createdBy: data.createdBy,
  };

  await stagingDocRef.set(stagingItem);

  // Update source suggestion status to indicate it has been staged
  try {
    await db.collection('workflowSuggestions').doc(suggestionId).update({
      status: 'staged',
      stagedAt: nowIso,
      stagingItemId,
    });
  } catch {
    // Non-critical backfill
  }

  return stagingItem;
}

/**
 * Cloud Function trigger: fires automatically whenever Gut-Instinct
 * creates a document in `workflowSuggestions/{suggestionId}`.
 */
export const onWorkflowSuggestionCreated = onDocumentCreated(
  'workflowSuggestions/{suggestionId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const db = snapshot.ref.firestore;
    const suggestionId = event.params.suggestionId;
    const data = snapshot.data() as WorkflowSuggestionPayload;

    try {
      await promoteWorkflowSuggestion(db, suggestionId, data);
    } catch (err) {
      console.error(`Failed to promote workflowSuggestion ${suggestionId} to staging:`, err);
    }
  }
);
