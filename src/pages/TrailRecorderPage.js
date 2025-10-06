import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTrailRecorder } from '../hooks/useTrailRecorder';

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return '0.00 km';
  }
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '00:00:00';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export default function TrailRecorderPage() {
  const [label, setLabel] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const {
    status,
    start,
    pause,
    resume,
    finish,
    reset,
    points,
    totalDistance,
    startedAt,
    isSaving,
    error,
  } = useTrailRecorder();

  useEffect(() => {
    if (!startedAt) {
      setElapsedMs(0);
      return undefined;
    }

    const startTime = new Date(startedAt).getTime();

    if (status === 'recording') {
      const update = () => {
        setElapsedMs(Date.now() - startTime);
      };
      update();
      const timer = setInterval(update, 1000);
      return () => clearInterval(timer);
    }

    setElapsedMs(Date.now() - startTime);
    return undefined;
  }, [startedAt, status]);

  const lastPoint = useMemo(() => {
    if (points.length === 0) {
      return null;
    }
    return points[points.length - 1];
  }, [points]);

  const canFinish = points.length >= 2 && !isSaving;
  const isIdle = status === 'idle';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';

  const handleStart = async () => {
    await start();
  };

  const handleFinish = async () => {
    const success = await finish({ label: label.trim() });
    if (success) {
      setLabel('');
    }
  };

  const handleReset = () => {
    reset();
    setLabel('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.header}>Trail Recorder</Text>

        <View style={styles.metricRow}>
          <View style={[styles.metricBox, styles.metricBoxSpacer]}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{formatDistance(totalDistance)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Duration</Text>
            <Text style={styles.metricValue}>{formatDuration(elapsedMs)}</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[styles.statusValue, styles[status] || styles.statusidle]}>
            {isSaving ? 'saving�' : status}
          </Text>
        </View>

        {lastPoint && (
          <View style={styles.coordsBox}>
            <Text style={styles.coordsLabel}>Last fix</Text>
            <Text style={styles.coordsValue}>
              {lastPoint.lat.toFixed(5)}, {lastPoint.lng.toFixed(5)}
            </Text>
            {lastPoint.accuracy && (
              <Text style={styles.coordsAccuracy}>
                � {Math.round(lastPoint.accuracy)} m
              </Text>
            )}
          </View>
        )}

        <TextInput
          placeholder="Trail name (optional)"
          value={label}
          editable={!isSaving}
          onChangeText={setLabel}
          style={styles.input}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.buttons}>
          {isIdle && (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, styles.buttonSpacer]}
              onPress={handleStart}
            >
              <Text style={styles.buttonText}>Start</Text>
            </TouchableOpacity>
          )}

          {isRecording && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, styles.buttonSpacer]}
                onPress={pause}
              >
                <Text style={styles.buttonText}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.primaryButton,
                  styles.buttonSpacer,
                  !canFinish && styles.buttonDisabled,
                ]}
                onPress={handleFinish}
                disabled={!canFinish}
              >
                <Text style={styles.buttonText}>{isSaving ? 'Saving�' : 'Finish'}</Text>
              </TouchableOpacity>
            </>
          )}

          {isPaused && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton, styles.buttonSpacer]}
                onPress={resume}
              >
                <Text style={styles.buttonText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.primaryButton,
                  styles.buttonSpacer,
                  !canFinish && styles.buttonDisabled,
                ]}
                onPress={handleFinish}
                disabled={!canFinish}
              >
                <Text style={styles.buttonText}>{isSaving ? 'Saving�' : 'Finish'}</Text>
              </TouchableOpacity>
            </>
          )}

          {!isIdle && (
            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleReset}>
              <Text style={styles.buttonText}>Discard</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: '#f8fafc',
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    color: '#111827',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
  },
  metricBoxSpacer: {
    marginRight: 12,
  },
  metricLabel: {
    color: '#cbd5f5',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 16,
    color: '#1f2937',
    marginRight: 8,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusidle: {
    color: '#6b7280',
  },
  statusrecording: {
    color: '#047857',
  },
  statuspaused: {
    color: '#b45309',
  },
  coordsBox: {
    backgroundColor: '#e0f2fe',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  coordsLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#0c4a6e',
  },
  coordsValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#082f49',
    marginTop: 4,
  },
  coordsAccuracy: {
    fontSize: 12,
    color: '#0369a1',
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  errorText: {
    color: '#b91c1c',
    marginBottom: 12,
    fontSize: 14,
  },
  buttons: {
    marginTop: 'auto',
  },
  button: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonSpacer: {
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#047857',
  },
  secondaryButton: {
    backgroundColor: '#1d4ed8',
  },
  dangerButton: {
    backgroundColor: '#dc2626',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f9fafb',
  },
});
