export enum CollectorType {
  PhoneUsage = 'phone_usage',
  Gmail = 'gmail',
  Manual = 'manual',
}

export enum MatchConfidence {
  High = 'high',
  Low = 'low',
  Confirmed = 'confirmed',
}

export enum SuggestionAction {
  Cut = 'cut',
  Consolidate = 'consolidate',
  Investigate = 'investigate',
}

export enum SuggestionResponse {
  Accepted = 'accepted',
  Dismissed = 'dismissed',
  Vetoed = 'vetoed',
  Snoozed = 'snoozed',
}
