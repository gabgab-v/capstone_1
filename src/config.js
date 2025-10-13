import { BASE_URL } from './lib/api';

const normalizedBaseUrl = BASE_URL.replace(/\/$/, '');

export const API_URL = `${normalizedBaseUrl}/api`;
