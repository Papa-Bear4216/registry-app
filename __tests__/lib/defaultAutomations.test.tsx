import {
  resolveTargetPackageOrIntent,
  executeAutomation,
  normalizeDiscoveredWorkflow,
  normalizeRegistryItem,
  parseStepsFromPayload,
  isSystemComponent,
} from '../../src/lib/defaultAutomations';
import { NativeModules, Alert, Linking } from 'react-native';

describe('defaultAutomations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
  });

  describe('resolveTargetPackageOrIntent', () => {
    it('resolves Phone / dialer accurately', () => {
      expect(resolveTargetPackageOrIntent('Phone').target).toBe('com.samsung.android.dialer');
      expect(resolveTargetPackageOrIntent('Quick Call & Contact Shunt', 'tel:').target).toBe('com.samsung.android.dialer');
      expect(resolveTargetPackageOrIntent('Call Support', 'dialer').target).toBe('com.samsung.android.dialer');
    });

    it('resolves Google Gemini for all AI requests including Claude references', () => {
      expect(resolveTargetPackageOrIntent('Gemini').target).toBe('com.google.android.apps.bard');
      expect(resolveTargetPackageOrIntent('Google Gemini').target).toBe('com.google.android.apps.bard');
      expect(resolveTargetPackageOrIntent('Gemini Workspace Dispatcher').target).toBe('com.google.android.apps.bard');
      expect(resolveTargetPackageOrIntent('AI Assistant').target).toBe('com.google.android.apps.bard');
      expect(resolveTargetPackageOrIntent('Claude').target).toBe('com.google.android.apps.bard');
      expect(resolveTargetPackageOrIntent('Claude Workspace Dispatcher').target).toBe('com.google.android.apps.bard');
    });

    it('resolves Contextual Coach & Collector accurately', () => {
      expect(resolveTargetPackageOrIntent('Personal data intelligence').target).toBe('com.registry.coach');
      expect(resolveTargetPackageOrIntent('Contextual Coach').target).toBe('com.registry.coach');
      expect(resolveTargetPackageOrIntent('Registry Usage Collector').target).toBe('com.registry.usagecollector');
    });

    it('resolves Google Play Store accurately', () => {
      expect(resolveTargetPackageOrIntent('Google Play Store').target).toBe('com.android.vending');
      expect(resolveTargetPackageOrIntent('Play Store').target).toBe('com.android.vending');
    });

    it('resolves Weather accurately', () => {
      expect(resolveTargetPackageOrIntent('Weather').target).toBe('com.sec.android.daemonapp');
      expect(resolveTargetPackageOrIntent('Samsung Weather').target).toBe('com.sec.android.daemonapp');
    });

    it('resolves WhatsApp, Discord, ClickUp, and Gmail accurately', () => {
      expect(resolveTargetPackageOrIntent('WhatsApp').target).toBe('com.whatsapp');
      expect(resolveTargetPackageOrIntent('Discord').target).toBe('com.discord');
      expect(resolveTargetPackageOrIntent('ClickUp').target).toBe('co.mangotechnologies.clickup');
      expect(resolveTargetPackageOrIntent('Gmail').target).toBe('com.google.android.gm');
    });

    it('resolves Notes accurately when specifically requested', () => {
      expect(resolveTargetPackageOrIntent('Samsung Notes').target).toBe('com.samsung.android.app.notes');
    });

    it('resolves URLs and deep links accurately', () => {
      const urlRes = resolveTargetPackageOrIntent('Custom Web', 'https://example.com/api');
      expect(urlRes.type).toBe('url');
      expect(urlRes.target).toBe('https://example.com/api');
    });
  });

  describe('executeAutomation', () => {
    it('calls NativeModules.AppLauncher.launchApp directly for package items without modal alert', async () => {
      NativeModules.AppLauncher = {
        launchApp: jest.fn().mockResolvedValue(true),
        isAppInstalled: jest.fn().mockResolvedValue(true),
      };

      const result = await executeAutomation('Gemini');
      expect(result).toBe(true);
      expect(NativeModules.AppLauncher.launchApp).toHaveBeenCalledWith('com.google.android.apps.bard');
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('opens dialer via native launcher for Phone item without modal alert', async () => {
      NativeModules.AppLauncher = {
        launchApp: jest.fn().mockResolvedValue(true),
        isAppInstalled: jest.fn().mockResolvedValue(true),
      };

      const result = await executeAutomation('Phone');
      expect(result).toBe(true);
      expect(NativeModules.AppLauncher.launchApp).toHaveBeenCalledWith('com.samsung.android.dialer');
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('falls back to Linking.openURL if launchPackage fails and tel: is supported', async () => {
      NativeModules.AppLauncher = {
        launchApp: jest.fn().mockResolvedValue(false),
        isAppInstalled: jest.fn().mockResolvedValue(false),
      };

      const result = await executeAutomation('Phone');
      expect(result).toBe(true);
      expect(Linking.openURL).toHaveBeenCalledWith('tel:');
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('opens URL directly when type is url', async () => {
      const result = await executeAutomation('Slack Meeting', 'slack://channel?team=T123&id=C456');
      expect(result).toBe(true);
      expect(Linking.openURL).toHaveBeenCalledWith('slack://channel?team=T123&id=C456');
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('executes multi-step workflows sequentially with snappy delay', async () => {
      NativeModules.AppLauncher = {
        launchApp: jest.fn().mockResolvedValue(true),
        isAppInstalled: jest.fn().mockResolvedValue(true),
      };

      const steps = [
        { order: 1, label: 'Listening App', target: 'com.codespaceapps.listeningapp', delayMs: 10 },
        { order: 2, label: 'Google Gemini', target: 'com.google.android.apps.bard', delayMs: 10 },
        { order: 3, label: 'Gmail Outreach', target: 'com.google.android.gm', delayMs: 10 },
      ];

      const result = await executeAutomation(
        'Academic Audio Research & Gmail Outreach',
        'com.codespaceapps.listeningapp -> com.google.android.apps.bard -> com.google.android.gm',
        'multi_step',
        steps
      );

      expect(result).toBe(true);
      expect(NativeModules.AppLauncher.launchApp).toHaveBeenCalledTimes(3);
      expect(NativeModules.AppLauncher.launchApp).toHaveBeenNthCalledWith(1, 'com.codespaceapps.listeningapp');
      expect(NativeModules.AppLauncher.launchApp).toHaveBeenNthCalledWith(2, 'com.google.android.apps.bard');
      expect(NativeModules.AppLauncher.launchApp).toHaveBeenNthCalledWith(3, 'com.google.android.gm');
    });
  });

  describe('normalizeDiscoveredWorkflow', () => {
    it('synthesizes raw listeningapp package into 3-step Academic Audio Research & Gmail Outreach', () => {
      const rawItem: any = {
        id: 'test-1',
        rawLabel: 'com.codespaceapps.listeningapp',
        rawIdentity: 'com.codespaceapps.listeningapp',
      };
      const normalized = normalizeDiscoveredWorkflow(rawItem);
      expect(normalized.workflowTitle).toBe('Academic Audio Research & Gmail Outreach');
      expect(normalized.steps).toHaveLength(3);
      expect(normalized.steps?.[0].label).toBe('Listening App');
      expect(normalized.steps?.[1].label).toBe('Google Gemini');
      expect(normalized.steps?.[2].label).toBe('Gmail Outreach');
      expect(normalized.steps?.[2].target).toBe('com.google.android.gm');
      expect(normalized.steps?.every((s) => s.delayMs === 120)).toBe(true);
    });

    it('synthesizes raw outlook package into 3-step Meeting Prep pipeline', () => {
      const rawItem: any = {
        id: 'test-2',
        rawLabel: 'com.microsoft.office.outlook',
        rawIdentity: 'com.microsoft.office.outlook',
      };
      const normalized = normalizeDiscoveredWorkflow(rawItem);
      expect(normalized.workflowTitle).toBe('Meeting Prep & Discord Standup Dispatch');
      expect(normalized.steps).toHaveLength(3);
      expect(normalized.steps?.[0].label).toBe('Google Calendar');
      expect(normalized.steps?.[1].label).toBe('Zoom Room');
      expect(normalized.steps?.[2].label).toBe('Discord Standup');
    });

    it('synthesizes raw single word Weather into 3-step morning briefing with Home Assistant', () => {
      const rawItem: any = {
        id: 'test-3',
        rawLabel: 'Weather',
      };
      const normalized = normalizeDiscoveredWorkflow(rawItem);
      expect(normalized.workflowTitle).toBe('Morning Weather & Smart Home Dispatch');
      expect(normalized.steps).toHaveLength(3);
      expect(normalized.steps?.[0].label).toBe('Samsung Weather');
      expect(normalized.steps?.[1].label).toBe('Home Assistant');
      expect(normalized.steps?.[2].label).toBe('Google Calendar');
    });

    it('purges legacy Samsung Notes references and re-normalizes to productive flow', () => {
      const legacyItem: any = {
        id: 'test-4',
        rawLabel: 'Note Clipper',
        actionPayload: 'com.android.chrome -> com.samsung.android.app.notes',
        steps: [
          { order: 1, label: 'Chrome', target: 'com.android.chrome', delayMs: 800 },
          { order: 2, label: 'Samsung Notes', target: 'com.samsung.android.app.notes', delayMs: 800 },
        ],
      };
      const normalized = normalizeDiscoveredWorkflow(legacyItem);
      expect(normalized.workflowTitle).not.toContain('Notes');
      expect(normalized.steps?.some((s) => s.target === 'com.samsung.android.app.notes')).toBe(false);
      expect(normalized.steps?.every((s) => s.delayMs === 120)).toBe(true);
    });

    it('purges legacy Claude references and re-normalizes to Google Gemini flow', () => {
      const legacyClaudeItem: any = {
        id: 'test-claude-legacy',
        rawLabel: 'Claude Task Pipeline',
        actionPayload: 'com.termux -> com.anthropic.claude -> com.discord',
        steps: [
          { order: 1, label: 'Termux', target: 'com.termux', delayMs: 120 },
          { order: 2, label: 'Claude AI', target: 'com.anthropic.claude', delayMs: 120 },
          { order: 3, label: 'Discord', target: 'com.discord', delayMs: 120 },
        ],
      };
      const normalized = normalizeDiscoveredWorkflow(legacyClaudeItem);
      expect(normalized.workflowTitle).toBe('Terminal Debugging & AI Assistance Flow');
      expect(normalized.steps?.some((s) => s.target === 'com.anthropic.claude')).toBe(false);
      expect(normalized.steps?.some((s) => s.target === 'com.google.android.apps.bard')).toBe(true);
    });
  });

  describe('normalizeRegistryItem', () => {
    it('normalizes legacy Claude item to Google Gemini', () => {
      const legacyItem: any = {
        id: 'auto-2',
        name: 'Claude',
        canonicalIdentity: 'com.anthropic.claude',
        actionPayload: 'com.anthropic.claude',
        description: 'Instant prompt into Claude workspace.',
      };
      const normalized = normalizeRegistryItem(legacyItem);
      expect(normalized.name).toBe('Google Gemini');
      expect(normalized.canonicalIdentity).toBe('com.google.android.apps.bard');
      expect(normalized.actionPayload).toBe('com.google.android.apps.bard');
      expect(normalized.description).toContain('Google Gemini');
    });

    it('replaces Claude in multi-step item steps with Google Gemini', () => {
      const multiStepItem: any = {
        id: 'auto-multi',
        name: 'Research Pipeline',
        steps: [
          { order: 1, label: 'Listening App', target: 'com.codespaceapps.listeningapp' },
          { order: 2, label: 'Claude AI', target: 'com.anthropic.claude' },
          { order: 3, label: 'Gmail', target: 'com.google.android.gm' },
        ],
      };
      const normalized = normalizeRegistryItem(multiStepItem);
      expect(normalized.steps?.[1].label).toBe('Google Gemini');
      expect(normalized.steps?.[1].target).toBe('com.google.android.apps.bard');
    });
  });

  describe('parseStepsFromPayload', () => {
    it('parses arrow delimited steps', () => {
      const steps = parseStepsFromPayload('Custom Flow', 'App A -> App B -> App C');
      expect(steps).toHaveLength(3);
      expect(steps[0].target).toBe('App A');
      expect(steps[1].target).toBe('App B');
      expect(steps[2].target).toBe('App C');
      expect(steps[0].delayMs).toBe(120);
    });
  });

  describe('isSystemComponent', () => {
    it('identifies internal OS processes accurately', () => {
      expect(isSystemComponent('System UI')).toBe(true);
      expect(isSystemComponent('com.android.systemui')).toBe(true);
      expect(isSystemComponent('IntentResolver')).toBe(true);
      expect(isSystemComponent('packageinstaller')).toBe(true);
    });

    it('returns false for user apps', () => {
      expect(isSystemComponent('com.android.chrome')).toBe(false);
      expect(isSystemComponent('co.mangotechnologies.clickup')).toBe(false);
      expect(isSystemComponent('Google Gemini')).toBe(false);
      expect(isSystemComponent('Claude AI')).toBe(false);
      expect(isSystemComponent('com.whatsapp')).toBe(false);
    });
  });
});
