import { storage } from './storage.js';

let refreshPromise = null;

export class HttpError extends Error {
  constructor(message, status = 0, code = null, errors = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export function parseJwt(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token, bufferSeconds = 30) {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) {
    return true;
  }
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now + bufferSeconds;
}

function formatErrorMessage(data, fallback) {
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
  }
  if (data?.errors && typeof data.errors === 'object' && data.errors.message) {
    return `${data.errors.field || 'input'}: ${data.errors.message}`;
  }
  return data?.error?.message || data?.message || fallback;
}

async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = storage.getRefreshToken();
  if (!refreshToken) {
    storage.clearTokens();
    return null;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/token/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.token) {
        storage.clearTokens();
        return null;
      }

      const payload = parseJwt(data.token);
      storage.setTokens(data.token, data.refresh_token || refreshToken, payload?.id || null);
      return data.token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function ensureValidToken() {
  const token = storage.getAccessToken();
  if (token && !isTokenExpiringSoon(token)) {
    return token;
  }
  if (!storage.getRefreshToken()) {
    if (token) {
      storage.clearTokens();
    }
    return null;
  }
  return refreshAccessToken();
}

async function request(path, options = {}, { auth = false, retry = true } = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = await ensureValidToken();
    if (!token) {
      throw new HttpError('Authentication required. Please log in.', 401, 'AUTH_UNAUTHORIZED');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(path, { ...options, headers });

  if (response.status === 401 && auth && retry && storage.getRefreshToken()) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      response = await fetch(path, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${renewed}` },
      });
    }
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(
      formatErrorMessage(data, `Request failed (HTTP ${response.status})`),
      response.status,
      data?.error?.code || null,
      data?.errors || null,
    );
  }

  return data;
}

export const api = {
  register(payload) {
    return request('/api/registration', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(credentials) {
    return request('/api/token', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  async logout() {
    const accessToken = storage.getAccessToken();
    const refreshToken = storage.getRefreshToken();
    try {
      if (refreshToken) {
        await fetch('/api/tokens', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      storage.clearTokens();
    }
  },

  getTweets(page = 1, limit = 20) {
    return request(`/api/tweets?limit=${encodeURIComponent(limit)}&page=${encodeURIComponent(page)}`);
  },

  createTweet(content) {
    return request('/api/tweets', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }, { auth: true });
  },

  updateTweet(tweetId, content) {
    return request(`/api/tweets/${encodeURIComponent(tweetId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }, { auth: true });
  },

  toggleLike(tweetId) {
    return request(`/api/tweets/${encodeURIComponent(tweetId)}/likes/toggle`, {
      method: 'POST',
      body: '{}',
    }, { auth: true });
  },

  getProfile(userId) {
    return request(`/api/profiles/${encodeURIComponent(userId)}`);
  },

  getUserTweets(userId, page = 1, limit = 20) {
    return request(`/api/profiles/${encodeURIComponent(userId)}/tweets?limit=${encodeURIComponent(limit)}&page=${encodeURIComponent(page)}`);
  },

  updateProfile(userId, payload) {
    return request(`/api/profiles/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, { auth: true });
  },

  getAdminStats() {
    return request('/api/admin/stats', { method: 'GET' }, { auth: true });
  },

  adminDeleteTweet(tweetId) {
    return request(`/api/admin/tweets/${encodeURIComponent(tweetId)}`, {
      method: 'DELETE',
    }, { auth: true });
  },

  async fetchRandomQuote() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('https://dummyjson.com/quotes/random', {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data?.quote) {
        throw new Error('Unexpected quote payload');
      }
      return {
        quote: String(data.quote),
        author: String(data.author || 'Unknown'),
      };
    } finally {
      clearTimeout(timer);
    }
  },

  avatarUrl(seed) {
    return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(seed || 'guest')}`;
  },
};
