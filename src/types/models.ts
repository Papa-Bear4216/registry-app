import { ItemStatus, ItemKind, BillingCycle, TaskCategory, AlertType, CollectorType, MatchConfidence } from './enums';

export interface RegistryItem {
  id: string;
  name: string;
  cost: number;
  billingCycle: BillingCycle;
  kind: ItemKind;
  status: ItemStatus;
  taskCategories: TaskCategory[];
  description: string;
  canonicalIdentity: string | null;
  justified: boolean;
  isBestForTask: boolean;
  useCases: string | null;
  capabilitySummary: string | null;
  sourceUrl: string | null;
  createdBy: string;
  createdAt: string; // ISO-8601
}

export interface Observation {
  id: string;
  registryItemId: string;
  observedAt: string; // ISO-8601
  windowHours: number;
  usageCount: number;
  usageDurationMs: number;
  createdBy: string;
}

export interface AlertDismissal {
  id: string;
  itemId: string;
  alertType: AlertType;
  dismissedAt: string | null; // ISO-8601
  snoozedUntil: string | null; // ISO-8601
  createdBy: string;
}

export interface StagingItem {
  id: string;
  rawLabel: string;
  rawCategory: string | null;
  rawIdentity: string | null;
  collector: CollectorType;
  sourceId: string;
  capturedAt: string; // ISO-8601
  suggestedMatch: string | null; // registryItems doc id
  suggestionConfidence: MatchConfidence | null;
  resolved: boolean;
  resolvedAt: string | null; // ISO-8601
  classifiedAt: string | null; // ISO-8601; null until aiClassify succeeds
  classifiedKind: ItemKind | null;
  classifiedCategory: TaskCategory | null;
  classifiedActive: boolean | null;
  classifiedConfidence: number | null;
  classifiedDescription: string | null;
  createdBy: string;
}
