import { CollectorType, MatchConfidence } from './enums';

export interface WorkflowStep {
  id?: string;
  order: number;
  label: string;
  target: string;
  type?: 'app_launch' | 'intent' | 'deep_link' | 'script';
  delayMs?: number;
}

export interface StagingItem {
  id: string;
  rawLabel: string;
  rawCategory: string | null;
  rawIdentity: string | null;
  payloadSnapshot: string;
  collector: CollectorType;
  sourceId: string;
  capturedAt: string; // ISO-8601
  suggestedMatch: string | null; // registryItems doc id
  suggestionConfidence: MatchConfidence | null;
  resolved: boolean;
  resolvedAt: string | null; // ISO-8601
  classifiedAt: string | null; // ISO-8601; null until aiClassify succeeds — distinguishes
  // "never successfully classified, needs retry" from "classified, awaiting user review"
  classifiedKind: string | null;
  classifiedCategory: string | null;
  classifiedActive: boolean | null;
  classifiedConfidence: number | null;
  classifiedDescription: string | null;
  createdBy: string;
  // Discovered on-device workflow fields (from Gemini Nano / Gut-Instinct)
  workflowTitle?: string;
  sourceSuggestionId?: string;
  triggerDescription?: string;
  actionType?: 'intent' | 'deep_link' | 'script' | 'app_launch' | 'multi_step';
  actionPayload?: string;
  estimatedSecondsSaved?: number;
  steps?: WorkflowStep[];
}

export interface DeviceSource {
  id: string;
  sourceId: string;
  label: string;
  collector: CollectorType;
  firstSeen: string; // ISO-8601
  lastSeen: string; // ISO-8601
  createdBy: string;
}
