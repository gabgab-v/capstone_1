import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapboxGL, { mapboxStatus } from '../lib/mapbox';
import { computeLineStringMeta } from '../utils/geo';
import {
  buildTrailShareMessage,
  computeTrailDurationMs,
  formatTrailAverageSpeed,
  formatTrailDistance,
  formatTrailDuration,
  publishTrailRecordingPost,
} from '../utils/trailSharing';

function ensureLineString(trail) {
  if (!trail) {
    return null;
  }

  const geoJson = trail.geoJson;
  if (geoJson && geoJson.type === 'LineString' && Array.isArray(geoJson.coordinates)) {
    return geoJson;
  }

  const samples = Array.isArray(trail.samples) ? trail.samples : [];
  if (samples.length < 2) {
    return null;
  }

  const coordinates = samples
    .map((sample) => {
      const lng = Number(sample.lng ?? sample.longitude);
      const lat = Number(sample.lat ?? sample.latitude);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return null;
      }
      return [lng, lat];
    })
    .filter(Boolean);

  if (coordinates.length < 2) {
    return null;
  }

  return {
    type: 'LineString',
    coordinates,
  };
}

export default function RecordedTrailSummary({ trail, onClose }) {
  const cameraRef = useRef(null);
  const [posting, setPosting] = useState(false);

  const lineString = useMemo(() => ensureLineString(trail), [trail]);
  const trailMeta = useMemo(() => computeLineStringMeta(lineString), [lineString]);
  const pointCount = useMemo(() => {
    if (Array.isArray(trail?.samples)) {
      return trail.samples.length;
    }
    if (lineString?.coordinates) {
      return lineString.coordinates.length;
    }
    return 0;
  }, [trail?.samples, lineString]);

  const durationMs = useMemo(
    () => computeTrailDurationMs(trail?.startedAt, trail?.endedAt),
    [trail?.startedAt, trail?.endedAt],
  );

  const handleShareToFeed = useCallback(async () => {
    if (!trail || posting) {
      return;
    }
    setPosting(true);
    try {
      await publishTrailRecordingPost(trail);
      Alert.alert('Trail shared', 'Your recording was posted to your feed.');
    } catch (error) {
      console.error('Failed to post trail recording:', error);
      const message = error?.message ?? 'Unable to share this recording right now.';
      Alert.alert('Share failed', message);
    } finally {
      setPosting(false);
    }
  }, [posting, trail]);

  const handleShareExternally = useCallback(async () => {
    if (!trail) {
      return;
    }
    try {
      const message = buildTrailShareMessage(trail);
      await Share.share({ message });
    } catch (error) {
      if (error?.message && error.message.includes('canceled')) {
        return;
      }
      console.error('Failed to open share sheet:', error);
      Alert.alert('Share unavailable', 'Unable to open the share sheet right now.');
    }
  }, [trail]);

  const handleExportGeometry = useCallback(async () => {
    if (!lineString) {
      Alert.alert('No trail data', 'There are not enough recorded points to export this route.');
      return;
    }
    try {
      const feature = {
        type: 'Feature',
        properties: {
          label: trail?.label ?? 'Recorded trail',
          startedAt: trail?.startedAt,
          endedAt: trail?.endedAt,
          totalDistanceMeters: trail?.totalDistanceMeters ?? null,
        },
        geometry: lineString,
      };
      const payload = JSON.stringify(feature, null, 2);
      await Share.share({
        title: 'Trail GeoJSON',
        message: payload,
      });
    } catch (error) {
      if (error?.message && error.message.includes('canceled')) {
        return;
      }
      console.error('Failed to export trail data:', error);
      Alert.alert('Export failed', error?.message || 'Unable to export this trail right now.');
    }
  }, [lineString, trail?.endedAt, trail?.label, trail?.startedAt, trail?.totalDistanceMeters]);

  useEffect(() => {
    if (!cameraRef.current || !trailMeta?.bounds) {
      return;
    }
    cameraRef.current.fitBounds(trailMeta.bounds.northEast, trailMeta.bounds.southWest, 40, 600);
  }, [trailMeta?.bounds]);

  const renderGeometryExportCard = () => {
    if (!lineString || !pointCount) {
      return null;
    }
    const previewCoordinates = lineString.coordinates.slice(0, 4);
    return (
      <View style={styles.exportCard}>
        <Text style={styles.exportTitle}>Offline trail data saved</Text>
        <Text style={styles.exportSubtitle}>Points recorded: {pointCount}</Text>
        <View style={styles.exportPreviewBox}>
          <Text style={styles.exportPreviewText}>
            {JSON.stringify(previewCoordinates, null, 2)}
            {lineString.coordinates.length > previewCoordinates.length ? '\n…' : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.exportButton} onPress={handleExportGeometry}>
          <Text style={styles.exportButtonText}>Share GeoJSON</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMap = () => {
    if (!mapboxStatus.isEnabled) {
      return (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>
            Map previews are disabled in this build. Your recording is still saved and can be exported to
            another mapping tool once you re-enable maps or regain connectivity.
          </Text>
          {renderGeometryExportCard()}
        </View>
      );
    }

    if (!mapboxStatus.tokenConfigured) {
      return (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>
            Add a Mapbox access token to preview the recorded trail map.
          </Text>
          {renderGeometryExportCard()}
        </View>
      );
    }

    if (!mapboxStatus.isAvailable) {
      return (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>
            Map previews are disabled in this build.
            {mapboxStatus.missingReason ? ` ${mapboxStatus.missingReason}` : ' Install @rnmapbox/maps to enable them.'}
          </Text>
          {renderGeometryExportCard()}
        </View>
      );
    }

    if (!lineString) {
      return (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>
            Trail points unavailable. Record at least two points to view the route.
          </Text>
          {renderGeometryExportCard()}
        </View>
      );
    }

    const startEndShape =
      trailMeta?.start && trailMeta?.end
        ? {
            type: 'FeatureCollection',
            features: [
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
            ],
          }
        : null;

    return (
      <View style={styles.mapContainer}>
        <MapboxGL.MapView
          style={styles.map}
          styleURL={MapboxGL.StyleURL.Outdoors}
          logoEnabled={false}
          attributionPosition={{ bottom: 8, left: 8 }}
        >
          <MapboxGL.Camera
            ref={cameraRef}
            centerCoordinate={trailMeta?.center}
            zoomLevel={trailMeta?.approxZoom ?? 12}
            animationMode="flyTo"
            animationDuration={600}
          />
          <MapboxGL.ShapeSource id="recorded-trail-line" shape={lineString}>
            <MapboxGL.LineLayer
              id="recorded-trail-line-layer"
              style={{
                lineColor: '#2563eb',
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
          {startEndShape && (
            <MapboxGL.ShapeSource id="recorded-trail-markers" shape={startEndShape}>
              <MapboxGL.CircleLayer
                id="recorded-trail-markers-layer"
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
        </MapboxGL.MapView>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Trail Saved</Text>
      <Text style={styles.cardSubtitle}>{trail?.label || 'Untitled Trail'}</Text>
      {renderMap()}
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricValue}>{formatTrailDistance(trail?.totalDistanceMeters)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Duration</Text>
          <Text style={styles.metricValue}>{formatTrailDuration(durationMs)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Avg speed</Text>
          <Text style={styles.metricValue}>
            {formatTrailAverageSpeed(trail?.totalDistanceMeters, durationMs)}
          </Text>
        </View>
      </View>
      <View style={styles.summaryFooter}>
        <Text style={styles.summaryFooterText}>
          {pointCount} GPS point{pointCount === 1 ? '' : 's'} captured
        </Text>
        <Text style={styles.summaryFooterText}>
          Started {trail?.startedAt ? new Date(trail.startedAt).toLocaleString() : 'N/A'}
        </Text>
        {trail?.endedAt && (
          <Text style={styles.summaryFooterText}>
            Finished {new Date(trail.endedAt).toLocaleString()}
          </Text>
        )}
      </View>
      <View style={styles.shareActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionPrimary, posting && styles.actionDisabled]}
          onPress={handleShareToFeed}
          disabled={posting}
        >
          <Text style={styles.actionButtonText}>{posting ? 'Posting...' : 'Post to Feed'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionSecondary]}
          onPress={handleShareExternally}
        >
          <Text style={styles.actionButtonText}>Share Externally</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 16,
    color: '#cbd5f5',
    marginBottom: 16,
  },
  mapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#1e293b',
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    height: 220,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  mapFallbackText: {
    color: '#d1d5db',
    textAlign: 'center',
    fontSize: 14,
  },
  exportCard: {
    marginTop: 16,
    width: '100%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#334155',
    padding: 12,
    backgroundColor: '#111827',
  },
  exportTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
    textAlign: 'center',
  },
  exportSubtitle: {
    fontSize: 12,
    color: '#cbd5f5',
    marginBottom: 6,
    textAlign: 'center',
  },
  exportPreviewBox: {
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#0f172a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1e293b',
    marginBottom: 8,
  },
  exportPreviewText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#94a3b8',
  },
  exportButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 10,
    borderRadius: 999,
  },
  exportButtonText: {
    color: '#022c22',
    fontWeight: '700',
    textAlign: 'center',
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  summaryFooter: {
    marginBottom: 20,
  },
  summaryFooterText: {
    fontSize: 13,
    color: '#cbd5f5',
    marginBottom: 4,
  },
  shareActions: {
    marginBottom: 16,
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionPrimary: {
    backgroundColor: '#2563eb',
  },
  actionSecondary: {
    backgroundColor: '#0ea5e9',
  },
  actionDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#0b1120',
    fontSize: 16,
    fontWeight: '700',
  },
});
