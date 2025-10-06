import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';

const tokenFromEnv = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const tokenFromConfig = Constants.expoConfig?.extra?.mapboxAccessToken ?? Constants.manifest?.extra?.mapboxAccessToken;
const resolvedToken = tokenFromEnv || tokenFromConfig || '';

if (resolvedToken && resolvedToken !== 'YOUR_MAPBOX_ACCESS_TOKEN') {
  MapboxGL.setAccessToken(resolvedToken);
} else {
  console.warn('[Mapbox] Access token missing. Set EXPO_PUBLIC_MAPBOX_TOKEN or expo.extra.mapboxAccessToken.');
}

MapboxGL.setTelemetryEnabled(false);

export const MAPBOX_ACCESS_TOKEN = resolvedToken;
export default MapboxGL;