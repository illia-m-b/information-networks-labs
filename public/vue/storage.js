const KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  userId: 'userId',
  draft: 'vue_tweet_draft',
  bookmarks: 'vue_bookmarks',
  theme: 'vue_theme',
};

function safeGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

export const storage = {
  getAccessToken() {
    return safeGet(KEYS.accessToken, null);
  },

  getRefreshToken() {
    return safeGet(KEYS.refreshToken, null);
  },

  getUserId() {
    return safeGet(KEYS.userId, null);
  },

  setTokens(accessToken, refreshToken = null, userId = null) {
    if (accessToken) {
      safeSet(KEYS.accessToken, accessToken);
    }
    if (refreshToken) {
      safeSet(KEYS.refreshToken, refreshToken);
    }
    if (userId) {
      safeSet(KEYS.userId, userId);
    }
  },

  clearTokens() {
    safeRemove(KEYS.accessToken);
    safeRemove(KEYS.refreshToken);
    safeRemove(KEYS.userId);
  },

  getDraft() {
    return safeGet(KEYS.draft, '');
  },

  saveDraft(text) {
    if (!text) {
      safeRemove(KEYS.draft);
      return;
    }
    safeSet(KEYS.draft, text);
  },

  clearDraft() {
    safeRemove(KEYS.draft);
  },

  getBookmarks() {
    try {
      const raw = safeGet(KEYS.bookmarks, '[]');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveBookmarks(bookmarks) {
    safeSet(KEYS.bookmarks, JSON.stringify(Array.isArray(bookmarks) ? bookmarks : []));
  },

  getTheme() {
    const theme = safeGet(KEYS.theme, 'light');
    return theme === 'dark' ? 'dark' : 'light';
  },

  saveTheme(theme) {
    safeSet(KEYS.theme, theme === 'dark' ? 'dark' : 'light');
  },

  getLikedMap(userId) {
    if (!userId) return {};
    try {
      const raw = safeGet(`tweet_likes_${userId}`, '{}');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  },

  setLiked(userId, tweetId, liked) {
    if (!userId || !tweetId) return;
    const map = this.getLikedMap(userId);
    if (liked) {
      map[tweetId] = true;
    } else {
      delete map[tweetId];
    }
    safeSet(`tweet_likes_${userId}`, JSON.stringify(map));
  },
};
