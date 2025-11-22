import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapboxGL, { mapboxStatus } from '../lib/mapbox';
import { computeLineStringMeta } from '../utils/geo';

function buildFeatureCollection(features) {
  return {
    type: 'FeatureCollection',
    features,
  };
}

export default function TrailMapPicker({
  trail,
  selectedLocation,
  onSelectLocation,
  onCameraChanged,
  style,
}) {
  const cameraRef = useRef(null);

  const trailShape = useMemo(() => trail?.geoJson ?? null, [trail?.geoJson]);
  const trailMeta = useMemo(() => computeLineStringMeta(trailShape), [trailShape]);

  const startEndShape = useMemo(() => {
    if (!trailMeta?.start || !trailMeta?.end) {
      return null;
    }
    return buildFeatureCollection([
      {
        type: 'Feature',
        id: 'trail-start',
        properties: { markerType: 'start' },
        geometry: { type: 'Point', coordinates: trailMeta.start },
      },
      {
        type: 'Feature',
        id: 'trail-end',
        properties: { markerType: 'end' },
        geometry: { type: 'Point', coordinates: trailMeta.end },
      },
    ]);
  }, [trailMeta]);

  const locationShape = useMemo(() => {
    if (!selectedLocation) {
      return null;
    }
    return buildFeatureCollection([
      {
        type: 'Feature',
        id: 'event-location',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [selectedLocation.lng, selectedLocation.lat],
        },
      },
    ]);
  }, [selectedLocation]);

  useEffect(() => {
    if (!cameraRef.current || !trailMeta?.bounds) {
      return;
    }
    cameraRef.current.fitBounds(
      trailMeta.bounds.northEast,
      trailMeta.bounds.southWest,
      40,
      600,
    );
  }, [trailMeta?.bounds]);

  const handlePress = (event) => {
    const coords = event?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      onSelectLocation?.({ lng: coords[0], lat: coords[1] });
    }
  };

  if (!mapboxStatus.isEnabled) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackText}>
          Map previews are disabled in this build. Trail points will still be recorded and can be exported
          when you enable maps later.
        </Text>
      </View>
    );
  }

  if (!mapboxStatus.tokenConfigured) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackText}>
          Add a Mapbox access token to preview and pick a location on the map.
        </Text>
      </View>
    );
  }

  if (!mapboxStatus.isAvailable) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackText}>
          Map rendering is unavailable in this build.
          {mapboxStatus.missingReason ? ` ${mapboxStatus.missingReason}` : ' Install @rnmapbox/maps in a dev client to enable it.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Outdoors}
        attributionPosition={{ bottom: 8, left: 8 }}
        logoEnabled={false}
        onPress={handlePress}
        onCameraChanged={onCameraChanged}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={selectedLocation ? 14 : trailMeta?.approxZoom ?? 12}
          centerCoordinate={
            selectedLocation
              ? [selectedLocation.lng, selectedLocation.lat]
              : trailMeta?.center
          }
          animationMode="flyTo"
          animationDuration={600}
        />
        <MapboxGL.UserLocation visible />
        {trailShape && (
          <MapboxGL.ShapeSource id="trail-line" shape={trailShape}>
            <MapboxGL.LineLayer
              id="trail-line-layer"
              style={{
                lineColor: '#2563eb',
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}
        {startEndShape && (
          <MapboxGL.ShapeSource id="trail-markers" shape={startEndShape}>
            <MapboxGL.CircleLayer
              id="trail-markers-layer"
              style={{
                circleRadius: 6,
                circleStrokeWidth: 2,
                circleStrokeColor: '#ffffff',
                circleColor: [
                  'match',
                  ['get', 'markerType'],
                  'start',
                  '#22c55e',
                  'end',
                  '#ef4444',
                  '#2563eb',
                ],
              }}
            />
          </MapboxGL.ShapeSource>
        )}
        {locationShape && (
          <MapboxGL.ShapeSource id="event-location" shape={locationShape}>
            <MapboxGL.CircleLayer
              id="event-location-layer"
              style={{
                circleRadius: 7,
                circleColor: '#f97316',
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 2,
              }}
            />
          </MapboxGL.ShapeSource>
        )}
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#dbeafe',
  },
  map: {
    flex: 1,
  },
  fallbackContainer: {
    height: 260,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fallbackText: {
    color: '#4b5563',
    textAlign: 'center',
    fontSize: 14,
  },
});
