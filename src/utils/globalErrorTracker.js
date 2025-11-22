const listeners = new Set();
const recentReports = [];
const HISTORY_LIMIT = 25;
let lastReport = null;
let isInitialised = false;

function logReport(report) {
  const prefix = `[GlobalErrorTracker] ${report.source}${report.isFatal ? ' (fatal)' : ''}`;
  const payload = report.stack || report.message;
  if (report.isFatal) {
    console.error(prefix, payload);
  } else {
    console.warn(prefix, payload);
  }
}

function notify(report) {
  listeners.forEach((listener) => {
    try {
      listener(report);
    } catch (error) {
      console.warn('[GlobalErrorTracker] Listener failure:', error);
    }
  });
}

function createReport(source, error, { isFatal = false, details = null } = {}) {
  return {
    id: `${source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    message: error?.message || 'Unknown error',
    stack: typeof error?.stack === 'string' ? error.stack : null,
    isFatal: Boolean(isFatal),
    timestamp: Date.now(),
    details,
  };
}

function recordReport(report) {
  lastReport = report;
  recentReports.push(report);
  while (recentReports.length > HISTORY_LIMIT) {
    recentReports.shift();
  }
  logReport(report);
  notify(report);
}

export function enableGlobalErrorTracking() {
  if (isInitialised) {
    return lastReport;
  }

  const ErrorUtilsRef = globalThis?.ErrorUtils;
  const previousHandler =
    typeof ErrorUtilsRef?.getGlobalHandler === 'function'
      ? ErrorUtilsRef.getGlobalHandler()
      : null;

  if (typeof ErrorUtilsRef?.setGlobalHandler === 'function') {
    ErrorUtilsRef.setGlobalHandler((error, isFatal) => {
      const report = createReport('js-exception', error, { isFatal });
      recordReport(report);
      if (typeof previousHandler === 'function') {
        try {
          previousHandler(error, isFatal);
        } catch (handlerError) {
          console.warn('[GlobalErrorTracker] Previous handler failed:', handlerError);
        }
      }
    });
  }

  if (typeof globalThis?.addEventListener === 'function') {
    const handleUnhandledRejection = (event) => {
      const reason =
        event?.reason instanceof Error
          ? event.reason
          : new Error(String(event?.reason ?? 'Unhandled promise rejection'));
      const report = createReport('unhandled-rejection', reason, { isFatal: false });
      recordReport(report);
    };
    globalThis.addEventListener('unhandledrejection', handleUnhandledRejection);
  }

  isInitialised = true;
  return lastReport;
}

export function subscribeToGlobalErrors(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLastGlobalError() {
  return lastReport;
}

export function getRecentErrorReports() {
  return [...recentReports];
}

export function reportHandledError(error, details) {
  const report = createReport('handled', error, { isFatal: false, details });
  recordReport(report);
  return report;
}
