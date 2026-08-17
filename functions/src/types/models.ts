import { CollectorType, MatchConfidence } from './enums';

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
  createdBy: string;
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
