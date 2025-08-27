// src/lib/api.js
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';  // 🔑 auto get token

const LOCAL_IP = '192.168.1.50';  // your PC’s LAN IP
const EMU_IP   = '10.0.2.2';      // Android emulator alias

const isRealAndroid = Platform.OS === 'android' && Device.isDevice;

export const BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://your-vercel-url.vercel.app'
    : Platform.OS === 'web'
        ? 'http://localhost:3000'
        : isRealAndroid
            ? `http://${LOCAL_IP}:3000`
            : Platform.OS === 'android'
                ? `http://${EMU_IP}:3000`
                : `http://${LOCAL_IP}:3000`; // iOS sim / real iOS

// ------------------------------
// 🔑 Helper to always add JWT
async function authHeaders() {
  const token = await SecureStore.getItemAsync('jwt');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
// ------------------------------

export async function post(path, body) {
  const url = `${BASE_URL}${path}`;
  console.log('📡 POST →', url, body);

  const res = await fetch(url, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorMsg = 'Request failed';
    try {
      const { error } = await res.json();
      errorMsg = error || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  const json = await res.json();
  console.log('✅ Response:', json);
  return json;
}

export async function get(path) {
  const url = `${BASE_URL}${path}`;
  console.log('📡 GET →', url);

  const res = await fetch(url, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    let errorMsg = 'Request failed';
    try {
      const { error } = await res.json();
      errorMsg = error || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  const json = await res.json();
  console.log('✅ Response:', json);
  return json;
}

export async function put(path, body) {
  const url = `${BASE_URL}${path}`;
  console.log('📡 PUT →', url, body);

  const res = await fetch(url, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorMsg = 'Request failed';
    try {
      const { error } = await res.json();
      errorMsg = error || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  const json = await res.json();
  console.log('✅ Response:', json);
  return json;
}
