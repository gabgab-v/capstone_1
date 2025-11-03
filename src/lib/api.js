import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};

const configuredBaseUrl = (() => {
  const fromExtra = typeof extra?.apiBaseUrl === 'string' ? extra.apiBaseUrl.trim() : '';
  const fromEnv =
    typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.EXPO_PUBLIC_API_URL === 'string'
      ? process.env.EXPO_PUBLIC_API_URL.trim()
      : '';
  const candidate = (fromExtra || fromEnv).replace(/\/$/, '');
  return candidate.length > 0 ? candidate : null;
})();

const defaultDevBaseUrl = (() => {
  if (Platform.OS === 'web') return 'http://localhost:3000';
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
})();

export const BASE_URL = configuredBaseUrl ?? defaultDevBaseUrl;

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;

  if (__DEV__) {
    const methodLabel = options.method || 'GET';
    let parsedBody;
    if (options.body) {
      try {
        parsedBody = JSON.parse(options.body);
      } catch {
        parsedBody = '[body parse failed]';
      }
    }
    console.log(`[api] ${methodLabel} ${url}`, parsedBody);
  }

  let response;
  try {
    response = await fetch(url, {
      headers: await authHeaders(),
      ...options,
    });
  } catch (error) {
    console.error('[api] network error:', error.message);
    throw new ApiError('Network request failed. Is the server running and accessible?', 0, {
      cause: error.message,
    });
  }

  if (!response.ok) {
    let errorBody = { message: `Request failed with status: ${response.status}` };
    try {
      errorBody = await response.json();
    } catch (_) {
      // ignore non-JSON responses
    }
    console.error('[api] http error:', response.status, errorBody);
    throw new ApiError(errorBody.message || 'An unknown API error occurred.', response.status, errorBody);
  }

  try {
    if (response.status === 204) {
      if (__DEV__) console.log('[api] response: 204 No Content');
      return null;
    }
    const json = await response.json();
    if (__DEV__) console.log('[api] response:', json);
    return json;
  } catch (error) {
    console.error('[api] json parsing error:', error.message);
    throw new ApiError('Failed to parse a valid JSON response from the server.', response.status, {
      cause: error.message,
    });
  }
}

export function createIdempotencyKey(prefix = 'bk') {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timePart}-${randomPart}`;
}

function normalizeHeaderBag(headersLike = {}) {
  if (!headersLike || typeof headersLike !== 'object') {
    return {};
  }
  return { ...headersLike };
}

export async function postFormData(path, formData, options = {}) {
  const url = `${BASE_URL}${path}`;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (__DEV__) console.log('[api] POST (FormData)', url);

  const extraHeaders = normalizeHeaderBag(options.headers);
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };

  const existingIdempotencyHeaderKey = Object.keys(headers).find(
    (key) => key && key.toLowerCase() === 'idempotency-key',
  );

  if (existingIdempotencyHeaderKey) {
    const normalized = headers[existingIdempotencyHeaderKey];
    headers[existingIdempotencyHeaderKey] =
      typeof normalized === 'string' ? normalized : String(normalized ?? '');
  } else if (options.idempotencyKey) {
    headers['Idempotency-Key'] = String(options.idempotencyKey);
  } else {
    headers['Idempotency-Key'] = createIdempotencyKey();
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (error) {
    console.error('[api] network error:', error.message);
    throw new ApiError('Network request failed.', 0, { cause: error.message });
  }

  if (!response.ok) {
    let errorBody = { message: `Request failed with status: ${response.status}` };
    try {
      errorBody = await response.json();
    } catch (_) {
      // ignore non-JSON responses
    }
    console.error('[api] http error:', response.status, errorBody);
    throw new ApiError(errorBody.message || 'An unknown API error occurred.', response.status, errorBody);
  }

  try {
    const json = await response.json();
    if (__DEV__) console.log('[api] response:', json);
    return json;
  } catch (error) {
    console.error('[api] json parsing error:', error.message);
    throw new ApiError('Failed to parse a valid JSON response from the server.', response.status, {
      cause: error.message,
    });
  }
}

export function get(path) {
  return request(path, { method: 'GET' });
}

export function post(path, body) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function put(path, body) {
  return request(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function patch(path, body) {
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function del(path) {
  return request(path, { method: 'DELETE' });
}
