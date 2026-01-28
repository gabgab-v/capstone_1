import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL, { MAPBOX_ACCESS_TOKEN } from '../lib/mapbox';
import { computeLineStringMeta } from '../utils/geo';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildFeatureCollection(features) {
  return {
    type: 'FeatureCollection',
    features,
  };
}

function asLineString(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (value.type === 'LineString' && Array.isArray(value.coordinates)) {
    return value;
  }
  return null;
}

function extendBounds(bounds, coordinate) {
  if (!coordinate) {
    return bounds ?? null;
  }

  const lng = coordinate.lng;
  const lat = coordinate.lat;

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return bounds ?? null;
  }

  if (!bounds) {
    return {
      northEast: [lng, lat],
      southWest: [lng, lat],
    };
  }

  const { northEast, southWest } = bounds;
  const updatedNorthEast = [
    Math.max(northEast[0], lng),
    Math.max(northEast[1], lat),
  ];
  const updatedSouthWest = [
    Math.min(southWest[0], lng),
    Math.min(southWest[1], lat),
  ];

  return {
    northEast: updatedNorthEast,
    southWest: updatedSouthWest,
  };
}

const CAMERA_PADDING = 48;
const CAMERA_DURATION = 600;

export default function EventLocationMap({ event, style }) {
  const previewCameraRef = useRef(null);
  const expandedCameraRef = useRef(null);
  const [isMapExpanded, setMapExpanded] = useState(false);

  const trailShape = useMemo(() => {
    if (!event) {
      return null;
    }
    return asLineString(event.trailGeoJson) ?? asLineString(event.trail?.geoJson);
  }, [event]);

  const trailMeta = useMemo(() => {
    if (!trailShape) {
      return null;
    }
    return computeLineStringMeta(trailShape);
  }, [trailShape]);

  const locationPoint = useMemo(() => {
    if (!event) {
      return null;
    }
    const lat = toNumber(event.locationLatitude);
    const lng = toNumber(event.locationLongitude);
    if (lat === null || lng === null) {
      return null;
    }
    return { lat, lng };
  }, [event]);

  const centerCoordinate = useMemo(() => {
    if (locationPoint) {
      return [locationPoint.lng, locationPoint.lat];
    }
    if (trailMeta?.center) {
      return trailMeta.center;
    }
    return null;
  }, [locationPoint, trailMeta?.center]);

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
    if (!locationPoint) {
      return null;
    }
    return buildFeatureCollection([
      {
        type: 'Feature',
        id: 'event-location',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [locationPoint.lng, locationPoint.lat],
        },
      },
    ]);
  }, [locationPoint]);

  const combinedBounds = useMemo(() => {
    const baseBounds = trailMeta?.bounds ?? null;
    return extendBounds(baseBounds, locationPoint);
  }, [trailMeta?.bounds, locationPoint]);

  const fitCameraToBounds = useCallback(
    (camera) => {
      if (!camera?.current || !combinedBounds) {
        return;
      }

      const [neLng, neLat] = combinedBounds.northEast;
      const [swLng, swLat] = combinedBounds.southWest;
      const isSinglePoint = neLng === swLng && neLat === swLat;

      if (isSinglePoint) {
        camera.current.setCamera({
          centerCoordinate: [neLng, neLat],
          zoomLevel: 14,
          animationMode: 'flyTo',
          animationDuration: CAMERA_DURATION,
        });
        return;
      }

      camera.current.fitBounds(
        combinedBounds.northEast,
        combinedBounds.southWest,
        CAMERA_PADDING,
        CAMERA_DURATION,
      );
    },
    [combinedBounds],
  );

  useEffect(() => {
    fitCameraToBounds(previewCameraRef);
  }, [fitCameraToBounds]);

  useEffect(() => {
    if (!isMapExpanded) {
      return;
    }
    const timer = setTimeout(() => fitCameraToBounds(expandedCameraRef), 200);
    return () => clearTimeout(timer);
  }, [fitCameraToBounds, isMapExpanded]);

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
      return (
        <View style={[fallbackStyle, expanded ? null : style]}>
          <Text style={expanded ? styles.expandedFallbackText : styles.fallbackText}>
            Map preview unavailable. Add a Mapbox access token to enable event directions.
          </Text>
        </View>
      );
    }

    if (!centerCoordinate) {
      const fallbackStyle = expanded ? styles.expandedFallback : styles.fallbackContainer;
      return (
        <View style={[fallbackStyle, expanded ? null : style]}>
          <Text style={expanded ? styles.expandedFallbackText : styles.fallbackText}>
            This event does not have a mapped location yet.
          </Text>
        </View>
      );
    }

    const cameraRef = expanded ? expandedCameraRef : previewCameraRef;
    const containerStyle = expanded ? styles.expandedContainer : [styles.container, style];
    const mapStyle = expanded ? styles.expandedMap : styles.map;

    return (
      <View style={containerStyle}>
        <MapboxGL.MapView
          style={mapStyle}
          styleURL={MapboxGL.StyleURL.Outdoors}
          attributionPosition={{ bottom: 8, left: 8 }}
          logoEnabled={false}
          scrollEnabled={expanded}
          zoomEnabled={expanded}
          rotateEnabled={expanded}
          pitchEnabled={expanded}
        >
          <MapboxGL.Camera
            ref={cameraRef}
            centerCoordinate={centerCoordinate}
            zoomLevel={locationPoint ? 13 : trailMeta?.approxZoom ?? 12}
            animationMode="flyTo"
            animationDuration={CAMERA_DURATION}
          />
          {trailShape && (
            <MapboxGL.ShapeSource id={`event-trail-${expanded ? 'expanded' : 'preview'}`} shape={trailShape}>
              <MapboxGL.LineLayer
                id={`event-trail-layer-${expanded ? 'expanded' : 'preview'}`}
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
            <MapboxGL.ShapeSource
              id={`event-trail-markers-${expanded ? 'expanded' : 'preview'}`}
              shape={startEndShape}
            >
              <MapboxGL.CircleLayer
                id={`event-trail-markers-layer-${expanded ? 'expanded' : 'preview'}`}
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
            <MapboxGL.ShapeSource
              id={`event-location-${expanded ? 'expanded' : 'preview'}`}
              shape={locationShape}
            >
              <MapboxGL.CircleLayer
                id={`event-location-layer-${expanded ? 'expanded' : 'preview'}`}
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
          <TouchableOpacity style={styles.expandOverlay} onPress={handleExpandMap} activeOpacity={0.9}>
            <View style={styles.expandButton}>
              <Text style={styles.expandButtonText}>Expand map</Text>
            </View>
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
            <Text style={styles.expandedTitle}>Event Trail</Text>
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
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#dbeafe',
  },
  map: {
    flex: 1,
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
  fallbackContainer: {
    height: 220,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  expandedFallback: {
    flex: 1,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  fallbackText: {
    color: '#475569',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  expandedFallbackText: {
    color: '#e2e8f0',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  expandOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 12,
  },
  expandButton: {
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
