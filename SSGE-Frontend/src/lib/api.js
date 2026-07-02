//Clase para manejar la comunicación con la API y el almacenamiento del token de autenticación.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const TOKEN_STORAGE_KEY = 'ssge-token';

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch (_error) {
    return '';
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch (_error) {
    // Ignorar errores de almacenamiento local.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (_error) {
    // Ignorar errores de almacenamiento local.
  }
}

export function getTokenPayload() {
  const token = getToken();
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadJson = decodeBase64Url(parts[1]);
    return JSON.parse(payloadJson);
  } catch (_error) {
    return null;
  }
}

export function getCurrentRole() {
  const payload = getTokenPayload();
  return payload?.rol || null;
}

export function isRoleAllowed(allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  const role = getCurrentRole();
  return Boolean(role && allowedRoles.includes(role));
}

export async function apiFetch(path, init = {}) {
  const token = getToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const finalUrl = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  return fetch(finalUrl, {
    ...init,
    headers,
  });
}
