/** @type {import('jest').Config} */
const testPathIgnorePatterns = ['/node_modules/', '/.claude/'];

module.exports = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/firebase/**/*.test.ts', '**/__tests__/lib/**/*.test.ts'],
      testPathIgnorePatterns,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.env.js'],
    },
    {
      displayName: 'native',
      preset: 'jest-expo',
      testMatch: ['**/__tests__/**/*.test.tsx'],
      testPathIgnorePatterns,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.native.js'],
      moduleNameMapper: {
        // Use the package's official in-memory Jest mock instead of the real
        // native module: under Jest there's no native AsyncStorage backing,
        // and invoking the real implementation from
        // src/firebase/config.ts's setup-time initializeFirebaseApp() call
        // (see jest.setup.native.js) trips Expo's lazy-require guard
        // ("trying to require a file outside of the scope of the test
        // code"), confirmed empirically.
        '^@react-native-async-storage/async-storage$':
          '<rootDir>/node_modules/@react-native-async-storage/async-storage/lib/module/jest/AsyncStorageMock.js',
      },
      transformIgnorePatterns: [
        '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|firebase|@firebase))',
        '/node_modules/react-native-reanimated/plugin/',
        '/node_modules/@react-native/babel-preset/',
      ],
      moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'node'],
      transform: {
        '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$':
          '<rootDir>/node_modules/@react-native/jest-preset/jest/assetFileTransformer.js',
        '\\.[cm]?[jt]sx?$': 'babel-jest',
      },
    },
  ],
};
