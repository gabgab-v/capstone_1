import React from 'react';
import { StyleSheet, Text, UIManager, View, requireNativeComponent } from 'react-native';
import Constants from 'expo-constants';

function resolveBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};
const envFlag = resolveBoolean(
  process.env?.EXPO_PUBLIC_ENABLE_MAPBOX ?? process.env?.EXPO_PUBLIC_ENABLE_MAP_PREVIEW,
);
const configFlag = resolveBoolean(extra?.enableMapboxPreview ?? extra?.mapboxEnabled);
const mapboxPreviewEnabled = envFlag ?? configFlag ?? false;

let MapboxModule = null;
let mapboxLoadError = null;
let hasNativeSupport = false;

function detectNativeSupport() {
  if (typeof UIManager?.getViewManagerConfig === 'function') {
    try {
      const config = UIManager.getViewManagerConfig('RNMGLMapView');
      return !!config;
    } catch (error) {
      mapboxLoadError = mapboxLoadError || error;
      return false;
    }
  }

  if (typeof requireNativeComponent === 'function') {
    try {
      requireNativeComponent('RNMGLMapView');
      return true;
    } catch (error) {
      mapboxLoadError = mapboxLoadError || error;
      return false;
    }
  }

  return true;
}

if (mapboxPreviewEnabled) {
  hasNativeSupport = detectNativeSupport();
  if (!hasNativeSupport && !mapboxLoadError) {
    mapboxLoadError = new Error('RNMGLMapView is not linked in this build.');
  }

  if (hasNativeSupport) {
    try {
      // eslint-disable-next-line global-require
      const required = require('@rnmapbox/maps');
      MapboxModule = required?.default ?? required;
    } catch (error) {
      mapboxLoadError = error;
    }
  }
}

const tokenFromEnv = process.env?.EXPO_PUBLIC_MAPBOX_TOKEN;
const tokenFromConfig =
  extra?.mapboxAccessToken ?? Constants.manifest?.extra?.mapboxAccessToken ?? null;
const resolvedToken = tokenFromEnv || tokenFromConfig || '';
const hasValidToken = Boolean(resolvedToken && resolvedToken !== 'YOUR_MAPBOX_ACCESS_TOKEN');

const disabledMessage = mapboxPreviewEnabled
  ? 'Mapbox is unavailable in this build.'
  : 'Map previews are disabled for this build. Set EXPO_PUBLIC_ENABLE_MAPBOX=1 to enable.';

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
  : disabledMessage;

let MapboxGL = createStubComponent(fallbackMessage);
if (MapboxModule && hasNativeSupport) {
  MapboxGL = MapboxModule;
}

const canRenderMap = Boolean(mapboxPreviewEnabled && MapboxModule && hasNativeSupport && hasValidToken);

if (canRenderMap && typeof MapboxGL.setAccessToken === 'function') {
  MapboxGL.setAccessToken(resolvedToken);
}

if (canRenderMap && typeof MapboxGL.setTelemetryEnabled === 'function') {
  MapboxGL.setTelemetryEnabled(false);
}

if (!mapboxPreviewEnabled) {
  console.info('[Mapbox] Map previews disabled by configuration. Enable EXPO_PUBLIC_ENABLE_MAPBOX=1 to re-enable.');
} else if (!hasValidToken) {
  console.warn('[Mapbox] Access token missing. Set EXPO_PUBLIC_MAPBOX_TOKEN or expo.extra.mapboxAccessToken.');
} else if (!canRenderMap) {
  const reason =
    mapboxLoadError?.message ||
    (!hasNativeSupport
      ? 'RNMGLMapView is not linked in this build.'
      : 'Unknown Mapbox initialization issue.');
  console.warn(`[Mapbox] Map previews unavailable: ${reason}`);
}

export const mapboxStatus = {
  isEnabled: mapboxPreviewEnabled,
  isAvailable: canRenderMap,
  hasNativeSupport,
  loadError: mapboxLoadError,
  missingReason:
    !mapboxPreviewEnabled
      ? 'Map previews disabled by configuration.'
      : mapboxLoadError?.message ||
        (!hasNativeSupport
          ? 'RNMGLMapView is not linked in this build. Use a custom dev client or remove Mapbox features.'
          : null),
  tokenConfigured: hasValidToken,
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
