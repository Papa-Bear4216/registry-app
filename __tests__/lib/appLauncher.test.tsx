import { launchPackage, isPackageInstalled } from '../../src/lib/appLauncher';
import { NativeModules, Alert } from 'react-native';

describe('appLauncher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('launches package successfully when AppLauncher native module returns true', async () => {
    NativeModules.AppLauncher = {
      launchApp: jest.fn().mockResolvedValue(true),
      isAppInstalled: jest.fn().mockResolvedValue(true),
    };
    const result = await launchPackage('com.registry.coach', 'Contextual Coach');
    expect(result).toBe(true);
    expect(NativeModules.AppLauncher.launchApp).toHaveBeenCalledWith('com.registry.coach');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows alert when package is not installed or launch fails', async () => {
    NativeModules.AppLauncher = {
      launchApp: jest.fn().mockResolvedValue(false),
      isAppInstalled: jest.fn().mockResolvedValue(false),
    };
    const result = await launchPackage('com.missing.app', 'Missing App');
    expect(result).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('App Not Found', expect.stringContaining('Missing App'));
  });

  it('checks package installation correctly', async () => {
    NativeModules.AppLauncher = {
      launchApp: jest.fn(),
      isAppInstalled: jest.fn().mockResolvedValue(true),
    };
    const installed = await isPackageInstalled('com.registry.coach');
    expect(installed).toBe(true);
    expect(NativeModules.AppLauncher.isAppInstalled).toHaveBeenCalledWith('com.registry.coach');
  });
});
