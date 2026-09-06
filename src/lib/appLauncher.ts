import { NativeModules, Alert } from 'react-native';

function getAppLauncher() {
  return NativeModules.AppLauncher;
}

export async function launchPackage(
  packageName: string,
  appLabel: string = 'App',
  showAlertOnError: boolean = true
): Promise<boolean> {
  const launcher = getAppLauncher();
  if (launcher?.launchApp) {
    try {
      const launched = await launcher.launchApp(packageName);
      if (!launched && showAlertOnError) {
        Alert.alert('App Not Found', `${appLabel} (${packageName}) is not installed on this device.`);
      }
      return launched;
    } catch (e: any) {
      if (showAlertOnError) {
        Alert.alert('Launch Error', `Could not open ${appLabel}: ${e?.message ?? 'Unknown error'}`);
      }
      return false;
    }
  } else {
    if (showAlertOnError) {
      Alert.alert('Not Supported', 'Native app launcher is only available on Android devices.');
    }
    return false;
  }
}

export async function isPackageInstalled(packageName: string): Promise<boolean> {
  const launcher = getAppLauncher();
  if (launcher?.isAppInstalled) {
    try {
      return await launcher.isAppInstalled(packageName);
    } catch {
      return false;
    }
  }
  return false;
}
