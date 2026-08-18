export enum ItemStatus {
  Keep = 'keep',
  Review = 'review',
  Cut = 'cut',
}

export enum ItemKind {
  App = 'app',
  Subscription = 'subscription',
  DevTool = 'dev_tool',
  Service = 'service',
  Hardware = 'hardware',
  Other = 'other',
}

export enum BillingCycle {
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  Annual = 'annual',
  OneTime = 'one_time',
}

export enum TaskCategory {
  Writing = 'writing',
  Coding = 'coding',
  Communication = 'communication',
  Design = 'design',
  Productivity = 'productivity',
  Media = 'media',
  Finance = 'finance',
  Utilities = 'utilities',
  Other = 'other',
}

export enum AlertType {
  Dormant = 'dormant',
  HighCost = 'high_cost',
  Redundant = 'redundant',
}

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
