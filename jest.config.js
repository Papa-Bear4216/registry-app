/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/firebase/**/*.test.ts', '**/__tests__/lib/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.env.js'],
    },
    {
      displayName: 'native',
      preset: 'jest-expo',
      testMatch: ['**/__tests__/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.native.js'],
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
