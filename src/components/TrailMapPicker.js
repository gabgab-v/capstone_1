import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL, { MAPBOX_ACCESS_TOKEN } from '../lib/mapbox';
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
  const previewCameraRef = useRef(null);
  const expandedCameraRef = useRef(null);
  const [isMapExpanded, setMapExpanded] = useState(false);

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
    if (!previewCameraRef.current || !trailMeta?.bounds) {
      return;
    }
    previewCameraRef.current.fitBounds(
      trailMeta.bounds.northEast,
      trailMeta.bounds.southWest,
      40,
      600,
    );
  }, [trailMeta?.bounds]);

  useEffect(() => {
    if (!isMapExpanded || !expandedCameraRef.current || !trailMeta?.bounds) {
      return;
    }
    const timer = setTimeout(() => {
      expandedCameraRef.current.fitBounds(
        trailMeta.bounds.northEast,
        trailMeta.bounds.southWest,
        40,
        600,
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [isMapExpanded, trailMeta?.bounds]);

  const handlePress = (event) => {
    const coords = event?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      onSelectLocation?.({ lng: coords[0], lat: coords[1] });
    }
  };

  const handleExpandMap = useCallback(() => {
    setMapExpanded(true);
  }, []);

  const handleCloseMap = useCallback(() => {
    setMapExpanded(false);
  }, []);

  const hasMapToken = MAPBOX_ACCESS_TOKEN && MAPBOX_ACCESS_TOKEN !== 'YOUR_MAPBOX_ACCESS_TOKEN';

  const renderMap = ({ expanded }) => {
    if (!hasMapToken) {
      const fallbackStyle = expanded ? styles.expandedFallback : styles.fallbackContainer;
      const textStyle = expanded ? styles.expandedFallbackText : styles.fallbackText;
      return (
        <View style={[fallbackStyle, expanded ? null : style]}>
          <Text style={textStyle}>
            Add a Mapbox access token to preview and pick a location on the map.
          </Text>
        </View>
      );
    }

    const cameraRef = expanded ? expandedCameraRef : previewCameraRef;
    const containerStyle = expanded ? styles.expandedContainer : [styles.container, style];
    const mapStyle = expanded ? styles.expandedMap : styles.map;
    const mapIdSuffix = expanded ? 'expanded' : 'preview';

    return (
      <View style={containerStyle}>
        <MapboxGL.MapView
          style={mapStyle}
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
            <MapboxGL.ShapeSource id={`trail-line-${mapIdSuffix}`} shape={trailShape}>
              <MapboxGL.LineLayer
                id={`trail-line-layer-${mapIdSuffix}`}
                style={{
                  lineColor: '#2563eb',
                  lineWidth: expanded ? 5 : 4,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </MapboxGL.ShapeSource>
          )}
          {startEndShape && (
            <MapboxGL.ShapeSource id={`trail-markers-${mapIdSuffix}`} shape={startEndShape}>
              <MapboxGL.CircleLayer
                id={`trail-markers-layer-${mapIdSuffix}`}
                style={{
                  circleRadius: expanded ? 7 : 6,
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
            <MapboxGL.ShapeSource id={`event-location-${mapIdSuffix}`} shape={locationShape}>
              <MapboxGL.CircleLayer
                id={`event-location-layer-${mapIdSuffix}`}
                style={{
                  circleRadius: expanded ? 8 : 7,
                  circleColor: '#f97316',
                  circleStrokeColor: '#ffffff',
                  circleStrokeWidth: 2,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
        </MapboxGL.MapView>
        {!expanded ? (
          <TouchableOpacity style={styles.expandButton} onPress={handleExpandMap}>
            <Text style={styles.expandButtonText}>Expand</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <>
      {renderMap({ expanded: false })}
      <Modal
        visible={isMapExpanded}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={handleCloseMap}
      >
        <SafeAreaView style={styles.expandedSafeArea}>
          <View style={styles.expandedHeader}>
            <Text style={styles.expandedTitle}>Trail Map</Text>
            <TouchableOpacity style={styles.expandedClose} onPress={handleCloseMap}>
              <Text style={styles.expandedCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
          {renderMap({ expanded: true })}
        </SafeAreaView>
      </Modal>
    </>
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
  expandedSafeArea: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  expandedHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  expandedClose: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#1e293b',
  },
  expandedCloseText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 12,
  },
  expandedContainer: {
    flex: 1,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#0b1120',
  },
  expandedMap: {
    flex: 1,
  },
  expandedFallback: {
    flex: 1,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  expandedFallbackText: {
    color: '#e2e8f0',
    textAlign: 'center',
    fontSize: 14,
  },
  expandButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  expandButtonText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
});
