// src/lib/api.js
import { Platform } from 'react-native';
import * as Device from 'expo-device';      // ← new
// no longer need Constants here

const LOCAL_IP = '192.168.254.145';  // your PC’s LAN IP
const EMU_IP   = '10.0.2.2';         // Android emulator alias

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

export async function post(path, body, token) {
  const url = `${BASE_URL}${path}`;
  console.log('📡 POST →', url, body);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

export async function get(path, token) {
  const url = `${BASE_URL}${path}`;
  console.log('📡 GET →', url);

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

export async function put(path, body, token) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

  return await res.json();
}



