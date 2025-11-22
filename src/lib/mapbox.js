import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

let MapboxModule = null;
let mapboxLoadError = null;

try {
  // eslint-disable-next-line global-require
  const required = require('@rnmapbox/maps');
  MapboxModule = required?.default ?? required;
} catch (error) {
  mapboxLoadError = error;
  const message = error?.message || String(error);
  console.warn('[Mapbox] Native module unavailable:', message);
}

const tokenFromEnv = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const tokenFromConfig =
  Constants.expoConfig?.extra?.mapboxAccessToken ?? Constants.manifest?.extra?.mapboxAccessToken;
const resolvedToken = tokenFromEnv || tokenFromConfig || '';

function createStubComponent(message) {
  const Placeholder = ({ style }) => (
    <View style={[styles.stubMap, style]}>
      <Text style={styles.stubTitle}>Map preview unavailable</Text>
      <Text style={styles.stubMessage}>{message}</Text>
    </View>
  );
  Placeholder.displayName = 'MapboxStubMapView';

  const NullComponent = ({ children }) => (children ?? null);
  NullComponent.displayName = 'MapboxStubComponent';

  const StyleURL = {
    Outdoors: 'mapbox://styles/mapbox/outdoors-v12',
    Satellite: 'mapbox://styles/mapbox/satellite-v9',
    Light: 'mapbox://styles/mapbox/light-v11',
    Dark: 'mapbox://styles/mapbox/dark-v11',
  };

  return {
    MapView: Placeholder,
    Camera: NullComponent,
    ShapeSource: NullComponent,
    LineLayer: NullComponent,
    CircleLayer: NullComponent,
    UserLocation: NullComponent,
    StyleURL,
    setAccessToken() {},
    setTelemetryEnabled() {},
  };
}

const fallbackMessage = mapboxLoadError
  ? `Native module missing: ${mapboxLoadError.message || 'See console for details.'}`
  : 'Mapbox is unavailable in this build.';

const MapboxGL = MapboxModule ?? createStubComponent(fallbackMessage);

if (!resolvedToken || resolvedToken === 'YOUR_MAPBOX_ACCESS_TOKEN') {
  console.warn('[Mapbox] Access token missing. Set EXPO_PUBLIC_MAPBOX_TOKEN or expo.extra.mapboxAccessToken.');
} else {
  MapboxGL.setAccessToken(resolvedToken);
}

MapboxGL.setTelemetryEnabled(false);

export const mapboxStatus = {
  isAvailable: Boolean(MapboxModule),
  loadError: mapboxLoadError,
  missingReason: mapboxLoadError?.message || null,
};

export const MAPBOX_ACCESS_TOKEN = resolvedToken;
export default MapboxGL;

const styles = StyleSheet.create({
  stubMap: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#475569',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  stubTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
    textAlign: 'center',
  },
  stubMessage: {
    fontSize: 13,
    color: '#cbd5f5',
    textAlign: 'center',
  },
});
