import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

// --- Configuration (Ensure LOCAL_IP is correct for your network) ---
const LOCAL_IP = '192.168.1.50'; // ⚠️ UPDATE THIS to your PC’s LAN IP
const EMU_IP   = '10.0.2.2';       // Android emulator alias

const isRealAndroid = Platform.OS === 'android' && Device.isDevice;

export const BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://your-vercel-url.vercel.app' // ⚠️ UPDATE THIS for production
    : Platform.OS === 'web'
      ? 'http://localhost:3000'
      : isRealAndroid
        ? `http://${LOCAL_IP}:3000`
        : Platform.OS === 'android'
          ? `http://${EMU_IP}:3000`
          : `http://${LOCAL_IP}:3000`; // iOS sim / real iOS

// --- Custom Error for Richer Feedback ---
/**
 * Custom error class for API requests.
 * @param {string} message - The error message.
 * @param {number} status - The HTTP status code (0 for network errors).
 * @param {object} body - The JSON response body from the server.
 */
export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}


// --- Helper to add JWT authentication headers ---
async function authHeaders() {
  const token = await SecureStore.getItemAsync('jwt');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * A generic request handler that centralizes error handling logic.
 * @param {string} path - The API endpoint path (e.g., '/api/users').
 * @param {object} options - The options for the fetch call (method, body, etc.).
 * @returns {Promise<any>} - The JSON response from the server.
 * @throws {ApiError} - Throws an ApiError on failure.
 */
async function request(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    console.log(`📡 ${options.method || 'GET'} →`, url, options.body ? JSON.parse(options.body) : '');

    let response;

    // 1. Handle Network Errors (e.g., server down, wrong IP)
    try {
        response = await fetch(url, {
            headers: await authHeaders(),
            ...options,
        });
    } catch (error) {
        console.error('🚨 Network Error:', error.message);
        throw new ApiError('Network request failed. Is the server running and accessible?', 0, { cause: error.message });
    }

    // 2. Handle HTTP Errors (e.g., 404 Not Found, 500 Internal Server Error)
    if (!response.ok) {
        let errorBody = { message: `Request failed with status: ${response.status}` };
        try {
            errorBody = await response.json();
        } catch (_) {
            // Ignore if the response body isn't valid JSON.
        }
        console.error('🚨 HTTP Error:', response.status, errorBody);
        throw new ApiError(errorBody.message || 'An unknown API error occurred.', response.status, errorBody);
    }

    // 3. Handle JSON Parsing Errors on successful responses
    try {
        // Handle cases where the response is successful but has no body (e.g., 204 No Content)
        if (response.status === 204) {
            console.log('✅ Response: 204 No Content');
            return null;
        }
        const json = await response.json();
        console.log('✅ Response:', json);
        return json;
    } catch (error) {
        console.error('🚨 JSON Parsing Error:', error.message);
        throw new ApiError('Failed to parse a valid JSON response from the server.', response.status, { cause: error.message });
    }
}

export async function postFormData(path, formData) {
    const url = `${BASE_URL}${path}`;
    const token = await SecureStore.getItemAsync('jwt');
    console.log(`📡 POST (FormData) →`, url);

    // For FormData, we must NOT set the 'Content-Type' header.
    // The browser/fetch API sets it automatically with the correct boundary.
    const headers = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData,
        });
    } catch (error) {
        console.error('🚨 Network Error:', error.message);
        throw new ApiError('Network request failed.', 0, { cause: error.message });
    }

    // Reuse the same error handling and JSON parsing logic as the `request` function
    if (!response.ok) {
        let errorBody = { message: `Request failed with status: ${response.status}` };
        try {
            errorBody = await response.json();
        } catch (_) {}
        console.error('🚨 HTTP Error:', response.status, errorBody);
        throw new ApiError(errorBody.message || 'An unknown API error occurred.', response.status, errorBody);
    }

    try {
        const json = await response.json();
        console.log('✅ Response:', json);
        return json;
    } catch (error) {
        console.error('🚨 JSON Parsing Error:', error.message);
        throw new ApiError('Failed to parse a valid JSON response from the server.', response.status, { cause: error.message });
    }
}

// --- Public API Methods ---

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

export function del(path) {
    return request(path, { method: 'DELETE' });
}
