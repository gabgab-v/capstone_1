import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { reportHandledError } from '../utils/globalErrorTracker';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary] Uncaught error:', error, info?.componentStack);
    this.setState({ info });
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, info);
    }
    reportHandledError(error, {
      boundary: 'AppErrorBoundary',
      componentStack: info?.componentStack,
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null });
    }
  }

  handleReset() {
    this.setState({ error: null, info: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{error?.message ?? 'Unknown fatal error'}</Text>
          <ScrollView style={styles.traceContainer}>
            <Text style={styles.traceLabel}>Stack trace</Text>
            <Text style={styles.traceText}>{error?.stack ?? 'No stack available.'}</Text>
            {info?.componentStack ? (
              <>
                <Text style={styles.traceLabel}>Component stack</Text>
                <Text style={styles.traceText}>{info.componentStack}</Text>
              </>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={styles.resetButton} onPress={this.handleReset}>
            <Text style={styles.resetText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fcd34d',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#f8fafc',
    marginBottom: 16,
  },
  traceContainer: {
    maxHeight: 220,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#334155',
    padding: 12,
    backgroundColor: '#111827',
    marginBottom: 20,
  },
  traceLabel: {
    fontSize: 12,
    color: '#cbd5f5',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 8,
  },
  traceText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  resetButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 999,
  },
  resetText: {
    textAlign: 'center',
    fontWeight: '700',
    color: '#022c22',
  },
});
