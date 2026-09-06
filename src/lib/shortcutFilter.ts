import { RegistryItem } from '../types/models';
import { ItemKind } from '../types/enums';

/**
 * Distinguishes true actionable workflow shortcuts/automations from raw phone package telemetry.
 */
export function isRealAutomation(item: RegistryItem): boolean {
  // If it has a suggestedAction, triggerSignature, or multi-step workflow steps, it is definitely a workflow automation
  if (item.suggestedAction || item.triggerSignature || (item.steps && item.steps.length > 0)) {
    return true;
  }
  // If its name is a reverse-DNS Android package name (e.g. com.facebook.orca) without an action,
  // it is raw app usage telemetry, not an automation shortcut.
  if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(item.name)) {
    return false;
  }
  // If item is marked as an app without an automation payload or steps, treat as raw app telemetry
  if (item.kind === ItemKind.App && !item.suggestedAction && !item.actionPayload && (!item.steps || item.steps.length === 0)) {
    return false;
  }
  return true;
}
