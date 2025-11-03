import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

let staticExtra = null;

try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const appConfig = require('../../app.json');
  staticExtra = appConfig?.expo?.extra ?? null;
} catch (error) {
  staticExtra = null;
}

export function getExpoExtra() {
  const candidates = [
    Constants?.expoConfig?.extra,
    Constants?.manifest?.extra,
    Constants?.manifest2?.extra?.expoClient?.extra,
    Constants?.manifest2?.extra,
    Updates?.manifest?.extra?.expoClient?.extra,
    Updates?.manifest?.extra,
    staticExtra,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && Object.keys(candidate).length > 0) {
      return candidate;
    }
  }

  return {};
}
