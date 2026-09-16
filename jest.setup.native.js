require('./jest.setup.env');

jest.setTimeout(15000);

const { connectAuthEmulator } = require('firebase/auth');
const { initializeFirebaseApp } = require('./src/firebase/config');

const { auth } = initializeFirebaseApp();

// Guard against re-connecting on repeated module loads / hot test reruns.
if (!auth.emulatorConfig) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
}
