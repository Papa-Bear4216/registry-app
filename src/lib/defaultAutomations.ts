import { Linking, Alert } from 'react-native';
import { launchPackage } from './appLauncher';
import { StagingItem, RegistryItem, WorkflowStep } from '../types/models';
import { ItemKind, ItemStatus, TaskCategory, CollectorType, BillingCycle } from '../types/enums';

export const SEEDED_DISCOVERED_PATTERNS: StagingItem[] = [
  {
    id: 'staging-pattern-1',
    rawLabel: 'Academic Audio Research & Gmail Outreach',
    workflowTitle: 'Academic Audio Research & Gmail Outreach',
    rawCategory: 'productivity',
    rawIdentity: 'listening_gemini_gmail',
    collector: CollectorType.PhoneUsage,
    sourceId: 'coach_gap_evaluator',
    capturedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: new Date(Date.now() - 3500 * 1000).toISOString(),
    classifiedKind: ItemKind.App,
    classifiedCategory: TaskCategory.Productivity,
    classifiedActive: true,
    classifiedConfidence: 0.96,
    classifiedDescription: 'Captures highlighted audio bookmarks from Listening App, prompts Google Gemini to synthesize core findings into structured analysis, and generates a ready-to-send draft in Gmail for team review.',
    triggerDescription: 'Triggered when audio paper bookmarking finishes in Listening App',
    actionType: 'multi_step',
    actionPayload: 'com.codespaceapps.listeningapp -> com.google.android.apps.bard -> com.google.android.gm',
    estimatedSecondsSaved: 240,
    steps: [
      { order: 1, label: 'Listening App', target: 'com.codespaceapps.listeningapp', delayMs: 120 },
      { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 120 },
      { order: 3, label: 'Gmail Outreach', target: 'com.google.android.gm', delayMs: 120 },
    ],
    createdBy: 'default',
  },
  {
    id: 'staging-pattern-2',
    rawLabel: 'Deep Research to ClickUp Task Flow',
    workflowTitle: 'Deep Research to ClickUp Task Flow',
    rawCategory: 'productivity',
    rawIdentity: 'chrome_perplexity_clickup',
    collector: CollectorType.PhoneUsage,
    sourceId: 'coach_gap_evaluator',
    capturedAt: new Date(Date.now() - 7200 * 1000).toISOString(),
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: new Date(Date.now() - 7000 * 1000).toISOString(),
    classifiedKind: ItemKind.App,
    classifiedCategory: TaskCategory.Writing,
    classifiedActive: true,
    classifiedConfidence: 0.94,
    classifiedDescription: 'Extracts research context from Chrome, prompts Perplexity AI for comparative analysis, and logs actionable engineering tasks directly in ClickUp.',
    triggerDescription: 'Triggered when article text copied in Chrome with rapid switches to Perplexity & ClickUp',
    actionType: 'multi_step',
    actionPayload: 'com.android.chrome -> ai.perplexity.app.android -> co.mangotechnologies.clickup',
    estimatedSecondsSaved: 180,
    steps: [
      { order: 1, label: 'Google Chrome', target: 'com.android.chrome', delayMs: 120 },
      { order: 2, label: 'Perplexity AI', target: 'ai.perplexity.app.android', delayMs: 120 },
      { order: 3, label: 'ClickUp Tasks', target: 'co.mangotechnologies.clickup', delayMs: 120 },
    ],
    createdBy: 'default',
  },
  {
    id: 'staging-pattern-3',
    rawLabel: 'Meeting Prep & Discord Standup Dispatch',
    workflowTitle: 'Meeting Prep & Discord Standup Dispatch',
    rawCategory: 'communication',
    rawIdentity: 'calendar_zoom_discord',
    collector: CollectorType.PhoneUsage,
    sourceId: 'coach_gap_evaluator',
    capturedAt: new Date(Date.now() - 10800 * 1000).toISOString(),
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: new Date(Date.now() - 10000 * 1000).toISOString(),
    classifiedKind: ItemKind.App,
    classifiedCategory: TaskCategory.Communication,
    classifiedActive: true,
    classifiedConfidence: 0.92,
    classifiedDescription: 'Opens upcoming event in Google Calendar, automatically launches Zoom conference room, and routes to team Discord channel for live coordination.',
    triggerDescription: 'Triggered <5m before scheduled calendar event or meeting',
    actionType: 'multi_step',
    actionPayload: 'com.google.android.calendar -> us.zoom.videomeetings -> com.discord',
    estimatedSecondsSaved: 180,
    steps: [
      { order: 1, label: 'Google Calendar', target: 'com.google.android.calendar', delayMs: 120 },
      { order: 2, label: 'Zoom Room', target: 'us.zoom.videomeetings', delayMs: 120 },
      { order: 3, label: 'Discord Standup', target: 'com.discord', delayMs: 120 },
    ],
    createdBy: 'default',
  },
  {
    id: 'staging-pattern-4',
    rawLabel: 'Priority Call & Client WhatsApp Follow-up',
    workflowTitle: 'Priority Call & Client WhatsApp Follow-up',
    rawCategory: 'communication',
    rawIdentity: 'dialer_whatsapp_followup',
    collector: CollectorType.PhoneUsage,
    sourceId: 'coach_gap_evaluator',
    capturedAt: new Date(Date.now() - 14400 * 1000).toISOString(),
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: new Date(Date.now() - 14000 * 1000).toISOString(),
    classifiedKind: ItemKind.App,
    classifiedCategory: TaskCategory.Communication,
    classifiedActive: true,
    classifiedConfidence: 0.89,
    classifiedDescription: 'Initiates voice call through Samsung Dialer and immediately opens WhatsApp to dispatch a direct client follow-up message.',
    triggerDescription: 'Triggered during scheduled voice calls or client follow-ups',
    actionType: 'multi_step',
    actionPayload: 'com.samsung.android.dialer -> com.whatsapp',
    estimatedSecondsSaved: 90,
    steps: [
      { order: 1, label: 'Samsung Dialer', target: 'com.samsung.android.dialer', delayMs: 120 },
      { order: 2, label: 'WhatsApp Client Chat', target: 'com.whatsapp', delayMs: 120 },
    ],
    createdBy: 'default',
  },
  {
    id: 'staging-pattern-5',
    rawLabel: 'Terminal Debugging & AI Assistance Flow',
    workflowTitle: 'Terminal Debugging & AI Assistance Flow',
    rawCategory: 'development',
    rawIdentity: 'termux_gemini_discord',
    collector: CollectorType.PhoneUsage,
    sourceId: 'coach_gap_evaluator',
    capturedAt: new Date(Date.now() - 18000 * 1000).toISOString(),
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: new Date(Date.now() - 17500 * 1000).toISOString(),
    classifiedKind: ItemKind.DevTool,
    classifiedCategory: TaskCategory.Writing,
    classifiedActive: true,
    classifiedConfidence: 0.95,
    classifiedDescription: 'Launches Termux development environment, prompts Google Gemini for code debugging and error analysis, and updates the Discord development thread.',
    triggerDescription: 'Triggered during active scripting sessions in Termux',
    actionType: 'multi_step',
    actionPayload: 'com.termux -> com.google.android.apps.bard -> com.discord',
    estimatedSecondsSaved: 210,
    steps: [
      { order: 1, label: 'Termux Terminal', target: 'com.termux', delayMs: 120 },
      { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 120 },
      { order: 3, label: 'Discord Dev Channel', target: 'com.discord', delayMs: 120 },
    ],
    createdBy: 'default',
  },
  {
    id: 'staging-pattern-6',
    rawLabel: 'Morning Weather & Smart Home Dispatch',
    workflowTitle: 'Morning Weather & Smart Home Dispatch',
    rawCategory: 'utility',
    rawIdentity: 'weather_homeassistant_calendar',
    collector: CollectorType.PhoneUsage,
    sourceId: 'coach_gap_evaluator',
    capturedAt: new Date(Date.now() - 21600 * 1000).toISOString(),
    suggestedMatch: null,
    suggestionConfidence: null,
    resolved: false,
    resolvedAt: null,
    classifiedAt: new Date(Date.now() - 21000 * 1000).toISOString(),
    classifiedKind: ItemKind.App,
    classifiedCategory: TaskCategory.Productivity,
    classifiedActive: true,
    classifiedConfidence: 0.91,
    classifiedDescription: 'Checks weather radar in Samsung Weather, triggers morning smart home scene in Home Assistant, and opens the daily schedule in Google Calendar.',
    triggerDescription: 'Triggered upon morning alarm dismiss or wake event',
    actionType: 'multi_step',
    actionPayload: 'com.sec.android.daemonapp -> io.homeassistant.companion.android -> com.google.android.calendar',
    estimatedSecondsSaved: 120,
    steps: [
      { order: 1, label: 'Samsung Weather', target: 'com.sec.android.daemonapp', delayMs: 120 },
      { order: 2, label: 'Home Assistant', target: 'io.homeassistant.companion.android', delayMs: 120 },
      { order: 3, label: 'Google Calendar', target: 'com.google.android.calendar', delayMs: 120 },
    ],
    createdBy: 'default',
  },
];

export const SEEDED_ACTIVE_AUTOMATIONS: RegistryItem[] = [
  {
    id: 'auto-1',
    name: 'Personal Data Intelligence',
    cost: 0,
    billingCycle: BillingCycle.Monthly,
    kind: ItemKind.App,
    status: ItemStatus.Keep,
    taskCategories: [TaskCategory.Productivity],
    description: 'Autonomous contextual research & query synthesis for personal telemetry data.',
    canonicalIdentity: 'com.registry.coach',
    justified: true,
    isBestForTask: true,
    useCases: 'On-device task analysis',
    capabilitySummary: 'Gemini Nano Gap Assistant',
    sourceUrl: null,
    createdBy: 'default',
    createdAt: new Date().toISOString(),
    keepClockExpiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    reusabilityCount: 12,
    triggerDescription: 'Active during multi-app switches with long dwell times',
    suggestedAction: {
      type: 'intent',
      payload: 'com.registry.coach',
      estimatedSecondsSaved: 180,
    },
    actionPayload: 'com.registry.coach',
  },
  {
    id: 'auto-2',
    name: 'Gemini Workspace Dispatcher',
    cost: 0,
    billingCycle: BillingCycle.Monthly,
    kind: ItemKind.App,
    status: ItemStatus.Keep,
    taskCategories: [TaskCategory.Design],
    description: 'Instant prompt & context transfer into Google Gemini mobile workspace.',
    canonicalIdentity: 'com.google.android.apps.bard',
    justified: true,
    isBestForTask: true,
    useCases: 'Drafting, reasoning, code synthesis',
    capabilitySummary: 'Google Gemini Launcher',
    sourceUrl: null,
    createdBy: 'default',
    createdAt: new Date().toISOString(),
    keepClockExpiresAt: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString(),
    reusabilityCount: 8,
    triggerDescription: 'Triggered from long-press selection or share sheet',
    suggestedAction: {
      type: 'intent',
      payload: 'com.google.android.apps.bard',
      estimatedSecondsSaved: 120,
    },
    actionPayload: 'com.google.android.apps.bard',
  },
  {
    id: 'auto-3',
    name: 'Quick Call & Contact Shunt',
    cost: 0,
    billingCycle: BillingCycle.Monthly,
    kind: ItemKind.App,
    status: ItemStatus.Keep,
    taskCategories: [TaskCategory.Communication],
    description: 'Speed dial and priority contact bridge without launching full dialer UI.',
    canonicalIdentity: 'com.samsung.android.dialer',
    justified: true,
    isBestForTask: true,
    useCases: 'Rapid call initiation',
    capabilitySummary: 'Direct Phone Dialer Intent',
    sourceUrl: null,
    createdBy: 'default',
    createdAt: new Date().toISOString(),
    keepClockExpiresAt: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
    reusabilityCount: 5,
    triggerDescription: 'Triggered during scheduled call intervals or calendar reminders',
    suggestedAction: {
      type: 'intent',
      payload: 'tel:',
      estimatedSecondsSaved: 45,
    },
    actionPayload: 'tel:',
  },
  {
    id: 'auto-4',
    name: 'Research & Team Outreach Pipeline',
    cost: 0,
    billingCycle: BillingCycle.Monthly,
    kind: ItemKind.App,
    status: ItemStatus.Keep,
    taskCategories: [TaskCategory.Productivity],
    description: '3-step autonomous pipeline: captures Chrome research, prompts Gemini for synthesis, and drafts outreach in Gmail.',
    canonicalIdentity: 'chrome_gemini_gmail',
    justified: true,
    isBestForTask: true,
    useCases: 'Deep research, cross-app summarization, team outreach',
    capabilitySummary: '3-Step Autonomous Flow',
    sourceUrl: null,
    createdBy: 'default',
    createdAt: new Date().toISOString(),
    keepClockExpiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    reusabilityCount: 5,
    triggerDescription: 'Triggered when researching articles in Chrome with rapid switch to Gemini & Gmail',
    estimatedSecondsSaved: 210,
    steps: [
      { order: 1, label: 'Google Chrome', target: 'com.android.chrome', delayMs: 120 },
      { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 120 },
      { order: 3, label: 'Gmail Outreach', target: 'com.google.android.gm', delayMs: 120 },
    ],
    actionPayload: 'com.android.chrome -> com.google.android.apps.bard -> com.google.android.gm',
    suggestedAction: {
      type: 'multi_step',
      payload: 'com.android.chrome -> com.google.android.apps.bard -> com.google.android.gm',
      estimatedSecondsSaved: 210,
      steps: [
        { order: 1, label: 'Google Chrome', target: 'com.android.chrome', delayMs: 120 },
        { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 120 },
        { order: 3, label: 'Gmail Outreach', target: 'com.google.android.gm', delayMs: 120 },
      ],
    },
  },
];

export interface AppCatalogEntry {
  label: string;
  pkg: string;
  category: TaskCategory;
  companionChain: { label: string; pkg: string }[];
}

export const APP_CATALOG: Record<string, AppCatalogEntry> = {
  'com.codespaceapps.listeningapp': {
    label: 'Listening App',
    pkg: 'com.codespaceapps.listeningapp',
    category: TaskCategory.Productivity,
    companionChain: [
      { label: 'Google Gemini', pkg: 'com.google.android.apps.bard' },
      { label: 'Gmail Outreach', pkg: 'com.google.android.gm' },
    ],
  },
  'com.android.chrome': {
    label: 'Google Chrome',
    pkg: 'com.android.chrome',
    category: TaskCategory.Productivity,
    companionChain: [
      { label: 'Perplexity AI', pkg: 'ai.perplexity.app.android' },
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
    ],
  },
  'ai.perplexity.app.android': {
    label: 'Perplexity AI',
    pkg: 'ai.perplexity.app.android',
    category: TaskCategory.Writing,
    companionChain: [
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
      { label: 'Gmail Outreach', pkg: 'com.google.android.gm' },
    ],
  },
  'com.google.android.apps.bard': {
    label: 'Google Gemini',
    pkg: 'com.google.android.apps.bard',
    category: TaskCategory.Writing,
    companionChain: [
      { label: 'Gmail Outreach', pkg: 'com.google.android.gm' },
      { label: 'Discord Discussion', pkg: 'com.discord' },
    ],
  },
  'com.anthropic.claude': {
    label: 'Claude AI',
    pkg: 'com.anthropic.claude',
    category: TaskCategory.Writing,
    companionChain: [
      { label: 'Gmail Outreach', pkg: 'com.google.android.gm' },
      { label: 'Discord Discussion', pkg: 'com.discord' },
    ],
  },
  'com.openai.chatgpt': {
    label: 'ChatGPT',
    pkg: 'com.openai.chatgpt',
    category: TaskCategory.Writing,
    companionChain: [
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
      { label: 'Gmail Outreach', pkg: 'com.google.android.gm' },
    ],
  },
  'com.termux': {
    label: 'Termux Terminal',
    pkg: 'com.termux',
    category: TaskCategory.Development,
    companionChain: [
      { label: 'Google Gemini Assistant', pkg: 'com.google.android.apps.bard' },
      { label: 'Discord Dev Channel', pkg: 'com.discord' },
    ],
  },
  'com.samsung.android.dialer': {
    label: 'Samsung Dialer',
    pkg: 'com.samsung.android.dialer',
    category: TaskCategory.Communication,
    companionChain: [
      { label: 'WhatsApp Client Chat', pkg: 'com.whatsapp' },
    ],
  },
  'com.google.android.calendar': {
    label: 'Google Calendar',
    pkg: 'com.google.android.calendar',
    category: TaskCategory.Communication,
    companionChain: [
      { label: 'Zoom Room', pkg: 'us.zoom.videomeetings' },
      { label: 'Discord Standup', pkg: 'com.discord' },
    ],
  },
  'us.zoom.videomeetings': {
    label: 'Zoom Meetings',
    pkg: 'us.zoom.videomeetings',
    category: TaskCategory.Communication,
    companionChain: [
      { label: 'Discord Standup', pkg: 'com.discord' },
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
    ],
  },
  'com.whatsapp': {
    label: 'WhatsApp',
    pkg: 'com.whatsapp',
    category: TaskCategory.Communication,
    companionChain: [
      { label: 'Google Calendar Event', pkg: 'com.google.android.calendar' },
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
    ],
  },
  'com.discord': {
    label: 'Discord',
    pkg: 'com.discord',
    category: TaskCategory.Communication,
    companionChain: [
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
      { label: 'Google Gemini Assistant', pkg: 'com.google.android.apps.bard' },
    ],
  },
  'co.mangotechnologies.clickup': {
    label: 'ClickUp',
    pkg: 'co.mangotechnologies.clickup',
    category: TaskCategory.Productivity,
    companionChain: [
      { label: 'Google Gemini Assistant', pkg: 'com.google.android.apps.bard' },
      { label: 'Gmail Outreach', pkg: 'com.google.android.gm' },
    ],
  },
  'com.google.android.gm': {
    label: 'Gmail',
    pkg: 'com.google.android.gm',
    category: TaskCategory.Communication,
    companionChain: [
      { label: 'Google Calendar Schedule', pkg: 'com.google.android.calendar' },
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
    ],
  },
  'io.homeassistant.companion.android': {
    label: 'Home Assistant',
    pkg: 'io.homeassistant.companion.android',
    category: TaskCategory.Utility,
    companionChain: [
      { label: 'Google Calendar', pkg: 'com.google.android.calendar' },
    ],
  },
  'com.sec.android.daemonapp': {
    label: 'Samsung Weather',
    pkg: 'com.sec.android.daemonapp',
    category: TaskCategory.Utility,
    companionChain: [
      { label: 'Home Assistant', pkg: 'io.homeassistant.companion.android' },
      { label: 'Google Calendar', pkg: 'com.google.android.calendar' },
    ],
  },
  'com.android.vending': {
    label: 'Google Play Store',
    pkg: 'com.android.vending',
    category: TaskCategory.Utility,
    companionChain: [
      { label: 'ClickUp Tasks', pkg: 'co.mangotechnologies.clickup' },
    ],
  },
};

export function getAppLabel(target: string): string {
  const trimmed = (target || '').trim();
  if (APP_CATALOG[trimmed]) {
    return APP_CATALOG[trimmed].label;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('gemini') || lower.includes('bard')) return 'Google Gemini';
  if (lower.includes('chrome')) return 'Google Chrome';
  if (lower.includes('perplexity')) return 'Perplexity AI';
  if (lower.includes('claude')) return 'Claude AI';
  if (lower.includes('chatgpt') || lower.includes('openai')) return 'ChatGPT';
  if (lower.includes('clickup')) return 'ClickUp';
  if (lower.includes('discord')) return 'Discord';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('gmail') || lower.includes('.gm')) return 'Gmail';
  if (lower.includes('calendar')) return 'Google Calendar';
  if (lower.includes('zoom')) return 'Zoom Room';
  if (lower.includes('termux')) return 'Termux Terminal';
  if (lower.includes('dialer') || lower.includes('phone') || lower.startsWith('tel:')) return 'Samsung Dialer';
  if (lower.includes('weather') || lower.includes('daemonapp')) return 'Samsung Weather';
  if (lower.includes('homeassistant')) return 'Home Assistant';
  if (lower.includes('listeningapp')) return 'Listening App';

  if (trimmed.startsWith('com.') || trimmed.startsWith('org.') || trimmed.startsWith('net.')) {
    const parts = trimmed.split('.');
    const last = parts[parts.length - 1];
    return last.charAt(0).toUpperCase() + last.slice(1);
  }
  return trimmed;
}

const IGNORED_SYSTEM_TARGETS = [
  'system ui',
  'systemui',
  'intentresolver',
  'packageinstaller',
  'keyguard',
  'com.android.systemui',
  'android',
  'com.google.android.packageinstaller',
  'com.android.settings',
  'com.sec.android.app.launcher',
  'com.samsung.android.incallui',
];

export function isSystemComponent(labelOrPkg?: string | null): boolean {
  if (!labelOrPkg) return false;
  const lower = labelOrPkg.toLowerCase().trim();
  if (!lower) return false;
  return IGNORED_SYSTEM_TARGETS.some((target) => lower === target || (target !== 'android' && lower.includes(target)));
}

export interface ResolvedTarget {
  type: 'url' | 'package';
  target: string;
}

/**
 * Resolves an item's friendly name, action payload, or category into a real, launchable
 * Android package name, deep link URL, or system intent.
 */
export function resolveTargetPackageOrIntent(name: string, payload?: string): ResolvedTarget {
  const rawTarget = (payload && payload.trim().length > 0 ? payload : name).trim();
  const lowerName = name.toLowerCase().trim();
  const lowerTarget = rawTarget.toLowerCase();

  // 1. Phone / Dialer / Calls
  if (
    lowerTarget.startsWith('tel:') ||
    lowerTarget.includes('dialer') ||
    lowerTarget === 'phone' ||
    lowerName === 'phone' ||
    lowerName.includes('call') ||
    lowerTarget.includes('call')
  ) {
    return { type: 'package', target: 'com.samsung.android.dialer' };
  }

  // 2. Google Gemini AI Assistant (primary AI assistant - all AI flows use Gemini)
  if (
    lowerTarget === 'gemini' ||
    lowerName.includes('gemini') ||
    lowerTarget.includes('gemini') ||
    lowerTarget.includes('bard') ||
    lowerName.includes('bard') ||
    lowerName === 'ai' ||
    lowerTarget === 'ai' ||
    lowerName === 'ai assistant' ||
    lowerTarget === 'ai assistant' ||
    lowerTarget === 'claude' ||
    lowerName.includes('claude') ||
    lowerTarget.includes('claude') ||
    lowerTarget.includes('anthropic')
  ) {
    return { type: 'package', target: 'com.google.android.apps.bard' };
  }

  // 3. Perplexity AI
  if (lowerTarget.includes('perplexity') || lowerName.includes('perplexity')) {
    return { type: 'package', target: 'ai.perplexity.app.android' };
  }

  // 4. ChatGPT
  if (lowerTarget.includes('chatgpt') || lowerName.includes('chatgpt') || lowerTarget.includes('openai')) {
    return { type: 'package', target: 'com.openai.chatgpt' };
  }

  // 5. ClickUp
  if (lowerTarget.includes('clickup') || lowerName.includes('clickup')) {
    return { type: 'package', target: 'co.mangotechnologies.clickup' };
  }

  // 6. WhatsApp
  if (lowerTarget.includes('whatsapp') || lowerName.includes('whatsapp')) {
    return { type: 'package', target: 'com.whatsapp' };
  }

  // 7. Discord
  if (lowerTarget.includes('discord') || lowerName.includes('discord')) {
    return { type: 'package', target: 'com.discord' };
  }

  // 8. Gmail
  if (lowerTarget.includes('gmail') || lowerName.includes('gmail') || lowerTarget.includes('.gm')) {
    return { type: 'package', target: 'com.google.android.gm' };
  }

  // 9. Google Calendar
  if (lowerTarget.includes('calendar') || lowerName.includes('calendar')) {
    return { type: 'package', target: 'com.google.android.calendar' };
  }

  // 10. Zoom
  if (lowerTarget.includes('zoom') || lowerName.includes('zoom')) {
    return { type: 'package', target: 'us.zoom.videomeetings' };
  }

  // 11. Termux
  if (lowerTarget.includes('termux') || lowerName.includes('termux')) {
    return { type: 'package', target: 'com.termux' };
  }

  // 12. Home Assistant
  if (lowerTarget.includes('homeassistant') || lowerName.includes('home assistant')) {
    return { type: 'package', target: 'io.homeassistant.companion.android' };
  }

  // 13. Google Play Store
  if (
    lowerTarget.includes('vending') ||
    lowerTarget.includes('play store') ||
    lowerName.includes('play store') ||
    lowerTarget === 'google play' ||
    lowerName === 'google play'
  ) {
    return { type: 'package', target: 'com.android.vending' };
  }

  // 14. Contextual Coach / Personal Data Intelligence
  if (
    lowerTarget.includes('coach') ||
    lowerName.includes('coach') ||
    lowerName.includes('personal data intelligence') ||
    lowerTarget.includes('personal data')
  ) {
    return { type: 'package', target: 'com.registry.coach' };
  }

  // 15. Native Usage Collector
  if (
    lowerTarget.includes('usagecollector') ||
    lowerTarget.includes('collector') ||
    lowerName.includes('collector')
  ) {
    return { type: 'package', target: 'com.registry.usagecollector' };
  }

  // 16. Weather
  if (
    lowerTarget.includes('weather') ||
    lowerName.includes('weather') ||
    lowerTarget.includes('daemonapp')
  ) {
    return { type: 'package', target: 'com.sec.android.daemonapp' };
  }

  // 17. Chrome Browser
  if (lowerTarget.includes('chrome') || lowerName.includes('chrome')) {
    return { type: 'package', target: 'com.android.chrome' };
  }

  // 18. Listening App
  if (lowerTarget.includes('listeningapp') || lowerName.includes('listening')) {
    return { type: 'package', target: 'com.codespaceapps.listeningapp' };
  }

  // 19. Samsung Notes (fallback only if specifically requested by package name)
  if (
    lowerTarget.includes('samsung.android.app.notes') ||
    lowerName.includes('samsung notes')
  ) {
    return { type: 'package', target: 'com.samsung.android.app.notes' };
  }

  // 20. Explicit URL or deep link scheme (e.g. https://, slack://)
  if (rawTarget.includes('://')) {
    return { type: 'url', target: rawTarget };
  }

  // 21. Reverse-DNS package name (e.g. com.example.app)
  if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(rawTarget)) {
    return { type: 'package', target: rawTarget };
  }

  // Default: attempt package launch with raw target
  return { type: 'package', target: rawTarget };
}

/**
 * Parses sequential workflow steps from a payload string, delimited format, or explicit steps array.
 * Sets default step delay to 120ms for snappy execution.
 */
export function parseStepsFromPayload(
  name: string,
  payload?: string,
  steps?: WorkflowStep[]
): WorkflowStep[] {
  if (steps && steps.length > 0) {
    return steps.map((s, idx) => ({
      order: s.order || idx + 1,
      label: s.label || getAppLabel(s.target),
      target: resolveTargetPackageOrIntent(s.target, s.target).target,
      type: s.type || 'app_launch',
      delayMs: s.delayMs ?? 120,
    }));
  }
  if (!payload) {
    if (name.includes('->') || name.includes('➔') || name.includes(' > ')) {
      return splitStepString(name);
    }
    return [{ order: 1, label: getAppLabel(name), target: resolveTargetPackageOrIntent(name).target, delayMs: 120 }];
  }

  // JSON array string
  const trimmed = payload.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((s, idx) => ({
          order: s.order || idx + 1,
          label: s.label || s.name || getAppLabel(s.target || s.payload || s),
          target: resolveTargetPackageOrIntent(s.target || s.payload || s).target,
          type: s.type || 'app_launch',
          delayMs: s.delayMs ?? 120,
        }));
      }
    } catch {}
  }

  // Arrow / delimiter separated
  if (payload.includes('->') || payload.includes('➔') || payload.includes(' > ') || payload.includes(';')) {
    return splitStepString(payload);
  }

  return [{ order: 1, label: getAppLabel(name), target: resolveTargetPackageOrIntent(name, payload).target, delayMs: 120 }];
}

function splitStepString(text: string): WorkflowStep[] {
  const delimiter = text.includes('➔') ? '➔' : text.includes('->') ? '->' : text.includes(' > ') ? ' > ' : ';';
  const parts = text.split(delimiter).map((p) => p.trim()).filter((p) => p.length > 0);
  return parts.map((part, index) => ({
    order: index + 1,
    label: getAppLabel(part),
    target: resolveTargetPackageOrIntent(part, part).target,
    delayMs: 120,
  }));
}

/**
 * Normalizes raw device events or telemetry packages into real, human-readable multi-step candidate workflows.
 * Guarantees that the Discovery tab displays actionable workflow pipelines instead of raw package names.
 * Purges Samsung Notes hardcoding and pairs events with real, verified productivity apps (delay: 120ms).
 */
export function normalizeDiscoveredWorkflow(item: StagingItem): StagingItem {
  const label = (item.rawLabel || '').trim();
  const identity = (item.rawIdentity || item.actionPayload || '').trim();
  const lowerLabel = label.toLowerCase();
  const lowerIdentity = identity.toLowerCase();

  // Check if item contains legacy Samsung Notes or Claude hardcoding that must be purged
  const hasLegacyNotesOrClaude =
    lowerLabel.includes('samsung notes') ||
    lowerLabel.includes('note clipper') ||
    lowerLabel.includes('claude') ||
    lowerIdentity.includes('samsung.android.app.notes') ||
    lowerIdentity.includes('anthropic') ||
    lowerIdentity.includes('claude') ||
    item.actionPayload?.includes('com.samsung.android.app.notes') ||
    item.actionPayload?.includes('com.anthropic.claude') ||
    item.steps?.some(
      (s) =>
        s.target?.includes('com.samsung.android.app.notes') ||
        s.target?.includes('com.anthropic.claude') ||
        s.label?.toLowerCase().includes('notes') ||
        s.label?.toLowerCase().includes('claude')
    );

  // 1. If it already has structured multi-step flow without legacy notes/Claude, preserve it with 120ms delays
  if (!hasLegacyNotesOrClaude && item.steps && item.steps.length > 0 && item.workflowTitle && !item.workflowTitle.startsWith('com.')) {
    return {
      ...item,
      steps: item.steps.map((s, idx) => ({
        ...s,
        order: idx + 1,
        delayMs: Math.min(s.delayMs ?? 120, 120),
      })),
    };
  }

  // 2. Listening App -> Google Gemini -> Gmail Outreach (3-step research & synthesis flow)
  if (lowerLabel.includes('listeningapp') || lowerIdentity.includes('listeningapp') || lowerLabel.includes('academic audio')) {
    return {
      ...item,
      workflowTitle: 'Academic Audio Research & Gmail Outreach',
      rawLabel: 'Academic Audio Research & Gmail Outreach',
      triggerDescription: 'Triggered when audio paper bookmarking finishes in Listening App',
      classifiedDescription: 'Captures highlighted audio bookmarks from Listening App, prompts Google Gemini to synthesize core findings into structured analysis, and generates a ready-to-send draft in Gmail for team review.',
      estimatedSecondsSaved: 240,
      actionPayload: 'com.codespaceapps.listeningapp -> com.google.android.apps.bard -> com.google.android.gm',
      steps: [
        { order: 1, label: 'Listening App', target: 'com.codespaceapps.listeningapp', delayMs: 120 },
        { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 120 },
        { order: 3, label: 'Gmail Outreach', target: 'com.google.android.gm', delayMs: 120 },
      ],
    };
  }

  // 3. Chrome -> Perplexity -> ClickUp Tasks (3-step research to action flow)
  if (lowerLabel.includes('chrome') || lowerIdentity.includes('chrome') || lowerLabel.includes('deep research')) {
    return {
      ...item,
      workflowTitle: 'Deep Research to ClickUp Task Flow',
      rawLabel: 'Deep Research to ClickUp Task Flow',
      triggerDescription: 'Triggered when research context copied in Chrome with rapid switches to Perplexity & ClickUp',
      classifiedDescription: 'Extracts research context from Chrome, prompts Perplexity AI for comparative analysis, and logs actionable engineering tasks directly in ClickUp.',
      estimatedSecondsSaved: 180,
      actionPayload: 'com.android.chrome -> ai.perplexity.app.android -> co.mangotechnologies.clickup',
      steps: [
        { order: 1, label: 'Google Chrome', target: 'com.android.chrome', delayMs: 120 },
        { order: 2, label: 'Perplexity AI', target: 'ai.perplexity.app.android', delayMs: 120 },
        { order: 3, label: 'ClickUp Tasks', target: 'co.mangotechnologies.clickup', delayMs: 120 },
      ],
    };
  }

  // 4. Calendar / Outlook -> Zoom -> Discord Standup (3-step meeting flow)
  if (lowerLabel.includes('calendar') || lowerIdentity.includes('calendar') || lowerLabel.includes('outlook') || lowerIdentity.includes('outlook') || lowerLabel.includes('meeting prep')) {
    return {
      ...item,
      workflowTitle: 'Meeting Prep & Discord Standup Dispatch',
      rawLabel: 'Meeting Prep & Discord Standup Dispatch',
      triggerDescription: 'Triggered <5m before scheduled calendar event or meeting invite',
      classifiedDescription: 'Opens upcoming event in Google Calendar, automatically launches Zoom conference room, and routes to team Discord channel for live coordination.',
      estimatedSecondsSaved: 180,
      actionPayload: 'com.google.android.calendar -> us.zoom.videomeetings -> com.discord',
      steps: [
        { order: 1, label: 'Google Calendar', target: 'com.google.android.calendar', delayMs: 120 },
        { order: 2, label: 'Zoom Room', target: 'us.zoom.videomeetings', delayMs: 120 },
        { order: 3, label: 'Discord Standup', target: 'com.discord', delayMs: 120 },
      ],
    };
  }

  // 5. Call / Dialer -> WhatsApp Client Follow-up (2-step communication flow)
  if (lowerLabel === 'call' || lowerLabel.includes('dialer') || lowerIdentity.includes('dialer') || lowerLabel.includes('priority call')) {
    return {
      ...item,
      workflowTitle: 'Priority Call & Client WhatsApp Follow-up',
      rawLabel: 'Priority Call & Client WhatsApp Follow-up',
      triggerDescription: 'Triggered during scheduled voice calls or client follow-ups',
      classifiedDescription: 'Initiates voice call through Samsung Dialer and immediately opens WhatsApp to dispatch a direct client follow-up message.',
      estimatedSecondsSaved: 90,
      actionPayload: 'com.samsung.android.dialer -> com.whatsapp',
      steps: [
        { order: 1, label: 'Samsung Dialer', target: 'com.samsung.android.dialer', delayMs: 120 },
        { order: 2, label: 'WhatsApp Client Chat', target: 'com.whatsapp', delayMs: 120 },
      ],
    };
  }

  // 6. Weather -> Home Assistant -> Google Calendar (3-step morning flow)
  if (lowerLabel === 'weather' || lowerIdentity.includes('daemonapp') || lowerLabel.includes('morning weather')) {
    return {
      ...item,
      workflowTitle: 'Morning Weather & Smart Home Dispatch',
      rawLabel: 'Morning Weather & Smart Home Dispatch',
      triggerDescription: 'Triggered upon morning alarm dismiss or wake event',
      classifiedDescription: 'Checks weather radar in Samsung Weather, triggers morning smart home scene in Home Assistant, and opens the daily schedule in Google Calendar.',
      estimatedSecondsSaved: 120,
      actionPayload: 'com.sec.android.daemonapp -> io.homeassistant.companion.android -> com.google.android.calendar',
      steps: [
        { order: 1, label: 'Samsung Weather', target: 'com.sec.android.daemonapp', delayMs: 120 },
        { order: 2, label: 'Home Assistant', target: 'io.homeassistant.companion.android', delayMs: 120 },
        { order: 3, label: 'Google Calendar', target: 'com.google.android.calendar', delayMs: 120 },
      ],
    };
  }

  // 7. Termux -> Google Gemini Assistant -> Discord Dev Channel
  if (lowerLabel.includes('termux') || lowerIdentity.includes('termux') || lowerLabel.includes('terminal debugging')) {
    return {
      ...item,
      workflowTitle: 'Terminal Debugging & AI Assistance Flow',
      rawLabel: 'Terminal Debugging & AI Assistance Flow',
      triggerDescription: 'Triggered during active scripting sessions in Termux',
      classifiedDescription: 'Launches Termux development environment, prompts Google Gemini for code debugging and error analysis, and updates the Discord development thread.',
      estimatedSecondsSaved: 210,
      actionPayload: 'com.termux -> com.google.android.apps.bard -> com.discord',
      steps: [
        { order: 1, label: 'Termux Terminal', target: 'com.termux', delayMs: 120 },
        { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 120 },
        { order: 3, label: 'Discord Dev Channel', target: 'com.discord', delayMs: 120 },
      ],
    };
  }

  // 8. Catalog-based matching for known installed packages
  const matchedCatalogKey = Object.keys(APP_CATALOG).find(
    (k) => lowerIdentity === k.toLowerCase() || lowerLabel === k.toLowerCase()
  );
  if (matchedCatalogKey) {
    const entry = APP_CATALOG[matchedCatalogKey];
    const steps: WorkflowStep[] = [
      { order: 1, label: entry.label, target: entry.pkg, delayMs: 120 },
      ...entry.companionChain.map((c, idx) => ({
        order: idx + 2,
        label: c.label,
        target: c.pkg,
        delayMs: 120,
      })),
    ];
    const payload = steps.map((s) => s.target).join(' -> ');
    return {
      ...item,
      workflowTitle: `${entry.label} Smart Workflow Pipeline`,
      rawLabel: `${entry.label} Smart Workflow Pipeline`,
      triggerDescription: `Triggered upon active use of ${entry.label}`,
      classifiedDescription: `Dispatches ${entry.label} and automatically links context into ${entry.companionChain.map((c) => c.label).join(' and ')}.`,
      estimatedSecondsSaved: 150,
      actionPayload: payload,
      steps,
    };
  }

  // 9. Generic package name fallback (e.g. com.example.app) -> synthesize into multi-step flow with Google Gemini & ClickUp
  if (label.startsWith('com.') || label.startsWith('org.') || label.startsWith('net.')) {
    const cleanName = label.split('.').pop() || label;
    const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    return {
      ...item,
      workflowTitle: `${formattedName} Task & Action Pipeline`,
      rawLabel: `${formattedName} Task & Action Pipeline`,
      triggerDescription: `Triggered upon multi-app transition involving ${formattedName}`,
      classifiedDescription: `Dispatches ${formattedName} workflow task, synthesizes findings via Google Gemini, and logs actionable items directly in ClickUp.`,
      estimatedSecondsSaved: 180,
      actionPayload: `${label} -> com.google.android.apps.bard -> co.mangotechnologies.clickup`,
      steps: [
        { order: 1, label: formattedName, target: label, delayMs: 120 },
        { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 120 },
        { order: 3, label: 'ClickUp Tasks', target: 'co.mangotechnologies.clickup', delayMs: 120 },
      ],
    };
  }

  // 10. Arrow delimited actionPayload
  if (item.actionPayload && (item.actionPayload.includes('->') || item.actionPayload.includes('➔'))) {
    const steps = parseStepsFromPayload(item.rawLabel, item.actionPayload);
    return {
      ...item,
      workflowTitle: item.workflowTitle || item.rawLabel,
      steps,
    };
  }

  return {
    ...item,
    workflowTitle: item.workflowTitle || item.rawLabel,
    steps: item.steps || [{ order: 1, label: getAppLabel(item.rawLabel), target: resolveTargetPackageOrIntent(item.rawLabel, item.actionPayload).target, delayMs: 120 }],
  };
}

/**
 * Normalizes registry items so that any workflows requiring an AI assistant use Google Gemini.
 */
export function normalizeRegistryItem(item: RegistryItem): RegistryItem {
  const lowerName = (item.name || '').toLowerCase();
  const lowerIdent = (item.canonicalIdentity || '').toLowerCase();
  const lowerPayload = (item.actionPayload || '').toLowerCase();

  const isClaude =
    lowerName.includes('claude') ||
    lowerIdent.includes('com.anthropic.claude') ||
    lowerPayload.includes('com.anthropic.claude');

  if (isClaude) {
    return {
      ...item,
      name: item.name.toLowerCase() === 'claude' ? 'Google Gemini' : item.name.replace(/claude/gi, 'Google Gemini'),
      canonicalIdentity: 'com.google.android.apps.bard',
      description: item.description?.replace(/claude/gi, 'Google Gemini') ?? 'Instant prompt & context transfer into Google Gemini mobile workspace.',
      capabilitySummary: 'Google Gemini Launcher',
      actionPayload: item.actionPayload?.replace(/com\.anthropic\.claude/g, 'com.google.android.apps.bard') ?? 'com.google.android.apps.bard',
      suggestedAction: item.suggestedAction ? {
        ...item.suggestedAction,
        payload: item.suggestedAction.payload?.replace(/com\.anthropic\.claude/g, 'com.google.android.apps.bard') ?? 'com.google.android.apps.bard',
      } : undefined,
      steps: item.steps?.map((step) => ({
        ...step,
        label: step.label?.toLowerCase().includes('claude') ? 'Google Gemini' : step.label,
        target: step.target === 'com.anthropic.claude' ? 'com.google.android.apps.bard' : step.target,
      })),
    };
  }

  if (item.steps && item.steps.some((s) => s.target === 'com.anthropic.claude' || s.label?.toLowerCase().includes('claude'))) {
    return {
      ...item,
      steps: item.steps.map((step) => ({
        ...step,
        label: step.label?.toLowerCase().includes('claude') ? 'Google Gemini' : step.label,
        target: step.target === 'com.anthropic.claude' ? 'com.google.android.apps.bard' : step.target,
      })),
    };
  }

  return item;
}

/**
 * Dispatches a single action target (package, URL, or intent).
 */
export async function executeSingleAction(
  name: string,
  target: string,
  type: string = 'app_launch'
): Promise<boolean> {
  const resolved = resolveTargetPackageOrIntent(name, target);
  try {
    if (resolved.type === 'url') {
      const canOpen = await Linking.canOpenURL(resolved.target).catch(() => false);
      if (canOpen) {
        await Linking.openURL(resolved.target);
        return true;
      }
    }

    if (resolved.type === 'package') {
      const launched = await launchPackage(resolved.target, name, false);
      if (launched) {
        return true;
      }

      if (resolved.target.includes('dialer')) {
        const canOpenTel = await Linking.canOpenURL('tel:').catch(() => false);
        if (canOpenTel) {
          await Linking.openURL('tel:');
          return true;
        }
      }
    }

    if (resolved.target.includes('://') || resolved.target.startsWith('tel:')) {
      const urlOpened = await Linking.openURL(resolved.target).catch(() => false);
      if (urlOpened) {
        return true;
      }
    }

    return false;
  } catch (e: any) {
    console.warn(`Execution step "${name}" failed:`, e);
    return false;
  }
}

/**
 * Genuinely executes an automation action or multi-step sequence.
 * Eliminates mock "Executed" alert popups and transitions directly into target applications.
 * Uses snappy 120ms sequential step delay.
 */
export async function executeAutomation(
  name: string,
  payload?: string,
  type: string = 'app_launch',
  steps?: WorkflowStep[]
): Promise<boolean> {
  const resolvedSteps = parseStepsFromPayload(name, payload, steps);

  if (resolvedSteps.length <= 1) {
    const singleTarget = resolvedSteps[0]?.target || payload || name;
    const ok = await executeSingleAction(name, singleTarget, type);
    if (!ok) {
      Alert.alert(
        'App Not Found',
        `Could not launch "${name}" (${singleTarget}). Please make sure this app is installed.`
      );
    }
    return ok;
  }

  // Multi-step execution: sequentially trigger each step with snappy delay (120ms)
  let executedCount = 0;
  for (let i = 0; i < resolvedSteps.length; i++) {
    const step = resolvedSteps[i];
    const ok = await executeSingleAction(step.label, step.target, step.type || type);
    if (ok) {
      executedCount++;
    }
    if (i < resolvedSteps.length - 1) {
      const waitTime = step.delayMs ?? 120;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  return executedCount > 0;
}

