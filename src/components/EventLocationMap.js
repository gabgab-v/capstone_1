import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapboxGL, { MAPBOX_ACCESS_TOKEN, mapboxStatus } from '../lib/mapbox';
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
  const cameraRef = useRef(null);

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

  useEffect(() => {
    if (!cameraRef.current || !combinedBounds) {
      return;
    }

    const [neLng, neLat] = combinedBounds.northEast;
    const [swLng, swLat] = combinedBounds.southWest;
    const isSinglePoint = neLng === swLng && neLat === swLat;

    if (isSinglePoint) {
      cameraRef.current.setCamera({
        centerCoordinate: [neLng, neLat],
        zoomLevel: 14,
        animationMode: 'flyTo',
        animationDuration: CAMERA_DURATION,
      });
      return;
    }

    cameraRef.current.fitBounds(
      combinedBounds.northEast,
      combinedBounds.southWest,
      CAMERA_PADDING,
      CAMERA_DURATION,
    );
  }, [combinedBounds]);

  if (!mapboxStatus.tokenConfigured) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackText}>
          Map preview unavailable. Add a Mapbox access token to enable event directions.
        </Text>
      </View>
    );
  }

  if (!mapboxStatus.isAvailable) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackText}>
          Map preview unavailable in this build.
          {mapboxStatus.missingReason ? ` ${mapboxStatus.missingReason}` : ' Install the @rnmapbox/maps native module to enable it.'}
        </Text>
      </View>
    );
  }

  if (!centerCoordinate) {
    return (
      <View style={[styles.fallbackContainer, style]}>
        <Text style={styles.fallbackText}>
          This event does not have a mapped location yet.
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
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={centerCoordinate}
          zoomLevel={locationPoint ? 13 : trailMeta?.approxZoom ?? 12}
          animationMode="flyTo"
          animationDuration={CAMERA_DURATION}
        />
        {trailShape && (
          <MapboxGL.ShapeSource id="event-trail" shape={trailShape}>
            <MapboxGL.LineLayer
              id="event-trail-layer"
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
          <MapboxGL.ShapeSource id="event-trail-markers" shape={startEndShape}>
            <MapboxGL.CircleLayer
              id="event-trail-markers-layer"
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
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#dbeafe',
  },
  map: {
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
  fallbackText: {
    color: '#475569',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
});
