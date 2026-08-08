import { useState } from 'react';

/**
 * Persist a device ID across localStorage and cookie for dual durability.
 * On first visit, generates a crypto.randomUUID().
 * Mirror between localStorage and a cookie for maximum persistence.
 */
export function useDeviceId(): string {
  // Lazy initializer: runs once, no side effects on re-renders
  const [deviceId] = useState(() => getOrCreateDeviceId());
  return deviceId;
}

function getOrCreateDeviceId(): string {
  const COOKIE_NAME = 'checkin_device_id';
  const LS_KEY = 'checkin_device_id';

  // Try localStorage first (most reliable)
  let deviceId: string | null = null;
  try {
    deviceId = localStorage.getItem(LS_KEY);
  } catch { /* private mode */ }

  // Try cookie as fallback
  if (!deviceId) {
    deviceId = getCookie(COOKIE_NAME);
  }

  // Generate new if neither exists
  if (!deviceId) {
    deviceId = crypto.randomUUID();
  }

  // Persist to both
  try {
    localStorage.setItem(LS_KEY, deviceId);
  } catch { /* storage full / private mode */ }

  try {
    setCookie(COOKIE_NAME, deviceId, 365);
  } catch { /* cookies blocked */ }

  return deviceId;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

export function getDeviceIdSync(): string {
  const LS_KEY = 'checkin_device_id';
  let deviceId = localStorage.getItem(LS_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(LS_KEY, deviceId);
  }
  return deviceId;
}