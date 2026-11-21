import { createApp, ref, computed, watch, onMounted } from 'https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.prod.js';
import { api, parseJwt } from './api.js';
import { storage } from './storage.js';

createApp({
  setup() {
    const theme = ref(storage.getTheme());
    const activeTab = ref('feed');
    const authMode = ref('login');

    const token = ref(storage.getAccessToken());
    const authForm = ref({ email: '', password: '', name: '', bio: '' });
    const authLoading = ref(false);
    const authError = ref('');

    const draft = ref(storage.getDraft());
    const draftRestored = ref(Boolean(draft.value));
    const composerLoading = ref(false);
    const composerError = ref('');
    const composerSuccess = ref('');
    const quoteLoading = ref(false);
    const quoteNotice = ref('');

    const tweets = ref([]);
    const page = ref(1);
    const limit = 20;
    const hasMore = ref(false);
    const feedLoading = ref(false);
    const feedError = ref('');
    const searchQuery = ref('');

    const editingTweetId = ref(null);
    const editingContent = ref('');
    const editSaving = ref(false);

    const bookmarks = ref(storage.getBookmarks());
    const likedMap = ref({});
    const failedAvatars = ref({});

    const selectedProfile = ref(null);
    const profileTweets = ref([]);
    const profileLoading = ref(false);
    const profileError = ref('');
    const profileEdit = ref({ name: '', bio: '' });
    const profileSaving = ref(false);
    const profileMessage = ref('');

    const adminStats = ref(null);
    const adminLoading = ref(false);
    const adminError = ref('');

    const currentUser = computed(() => {
      if (!token.value) return null;
      const payload = parseJwt(token.value);
      if (!payload || !payload.id) return null;
      const roles = Array.isArray(payload.roles) ? payload.roles : ['ROLE_USER'];
      return {
        id: payload.id,
        email: payload.username || '',
        roles,
        isAdmin: roles.includes('ROLE_ADMIN'),
      };
    });

    const filteredTweets = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (!q) return tweets.value;
      return tweets.value.filter((t) => {
        const content = (t.content || '').toLowerCase();
        const author = (t.author?.name || '').toLowerCase();
        return content.includes(q) || author.includes(q);
      });
    });

    const remainingChars = computed(() => 280 - draft.value.length);

    function applyTheme(nextTheme) {
      document.documentElement.dataset.bsTheme = nextTheme;
    }

    function toggleTheme() {
      theme.value = theme.value === 'dark' ? 'light' : 'dark';
    }

    watch(theme, (next) => {
      storage.saveTheme(next);
      applyTheme(next);
    }, { immediate: true });

    watch(draft, (next) => {
      storage.saveDraft(next);
      if (!next) {
        draftRestored.value = false;
      }
    });

    watch(bookmarks, (next) => {
      storage.saveBookmarks(next);
    }, { deep: true });

    watch(currentUser, (user) => {
      likedMap.value = user ? storage.getLikedMap(user.id) : {};
    }, { immediate: true });

    function syncTokenFromStorage() {
      token.value = storage.getAccessToken();
    }

    function initials(name) {
      const text = String(name || '?').trim();
      return text ? text.slice(0, 2).toUpperCase() : '?';
    }

    function formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
    }

    function avatarUrl(authorId) {
      return api.avatarUrl(authorId);
    }

    function markAvatarFailed(authorId) {
      if (authorId) {
        failedAvatars.value = { ...failedAvatars.value, [authorId]: true };
      }
    }

    function isBookmarked(tweetId) {
      return bookmarks.value.some((b) => b.id === tweetId);
    }

    function toggleBookmark(tweet) {
      if (!tweet?.id) return;
      if (isBookmarked(tweet.id)) {
        bookmarks.value = bookmarks.value.filter((b) => b.id !== tweet.id);
      } else {
        bookmarks.value = [
          {
            id: tweet.id,
            content: tweet.content,
            createdAt: tweet.createdAt,
            likesCount: tweet.likesCount ?? 0,
            author: tweet.author || { id: '', name: 'Unknown' },
          },
          ...bookmarks.value,
        ];
      }
    }

    function clearBookmarks() {
      bookmarks.value = [];
    }

    async function loadFeed(reset = true) {
      feedLoading.value = true;
      feedError.value = '';
      if (reset) {
        page.value = 1;
      }

      try {
        const data = await api.getTweets(page.value, limit);
        const batch = Array.isArray(data?.tweets) ? data.tweets : [];
        tweets.value = reset ? batch : [...tweets.value, ...batch];
        hasMore.value = batch.length === limit;
      } catch (err) {
        feedError.value = err.message || 'Unable to load feed. Stored bookmarks remain available offline.';
      } finally {
        feedLoading.value = false;
      }
    }

    async function loadMoreTweets() {
      if (feedLoading.value || !hasMore.value) return;
      page.value += 1;
      await loadFeed(false);
    }

    async function submitAuth() {
      authLoading.value = true;
      authError.value = '';
      try {
        if (authMode.value === 'register') {
          await api.register({
            email: authForm.value.email,
            password: authForm.value.password,
            name: authForm.value.name,
            bio: authForm.value.bio || null,
          });
        }
        const res = await api.login({
          email: authForm.value.email,
          password: authForm.value.password,
        });
        const decoded = parseJwt(res.token);
        storage.setTokens(res.token, res.refresh_token || null, decoded?.id || null);
        syncTokenFromStorage();
        authForm.value = { email: '', password: '', name: '', bio: '' };
        if (currentUser.value?.isAdmin) {
          await loadAdminStats();
        }
      } catch (err) {
        authError.value = err.message || 'Authentication failed';
      } finally {
        authLoading.value = false;
      }
    }

    async function handleLogout() {
      await api.logout();
      syncTokenFromStorage();
      adminStats.value = null;
      if (activeTab.value === 'admin') {
        activeTab.value = 'feed';
      }
    }

    async function inspireDraft() {
      quoteLoading.value = true;
      quoteNotice.value = '';
      composerError.value = '';
      try {
        const result = await api.fetchRandomQuote();
        const combined = `"${result.quote}" — ${result.author}`;
        draft.value = combined.length > 280 ? `${combined.slice(0, 277)}...` : combined;
        quoteNotice.value = `Quote loaded from dummyjson.com (${result.author}).`;
      } catch {
        quoteNotice.value = 'External quote API unreachable (offline or blocked). You can type your tweet manually.';
      } finally {
        quoteLoading.value = false;
      }
    }

    function clearDraft() {
      draft.value = '';
      storage.clearDraft();
      draftRestored.value = false;
      quoteNotice.value = '';
    }

    async function publishTweet() {
      const content = draft.value.trim();
      if (!content) {
        composerError.value = 'Tweet content cannot be empty.';
        return;
      }
      composerLoading.value = true;
      composerError.value = '';
      composerSuccess.value = '';
      try {
        await api.createTweet(content);
        clearDraft();
        composerSuccess.value = 'Tweet published.';
        await loadFeed(true);
        syncTokenFromStorage();
      } catch (err) {
        composerError.value = err.message || 'Failed to publish tweet.';
        syncTokenFromStorage();
      } finally {
        composerLoading.value = false;
      }
    }

    function startEdit(tweet) {
      editingTweetId.value = tweet.id;
      editingContent.value = tweet.content;
    }

    function cancelEdit() {
      editingTweetId.value = null;
      editingContent.value = '';
    }

    async function saveEdit(tweet) {
      const next = editingContent.value.trim();
      if (!next) return;
      editSaving.value = true;
      feedError.value = '';
      try {
        const updated = await api.updateTweet(tweet.id, next);
        tweet.content = updated.content;
        tweet.updatedAt = updated.updatedAt;
        cancelEdit();
      } catch (err) {
        feedError.value = err.message || 'Failed to update tweet.';
      } finally {
        editSaving.value = false;
      }
    }

    async function toggleLike(tweet) {
      if (!currentUser.value) return;
      const prevLiked = Boolean(likedMap.value[tweet.id]);
      const prevCount = Number(tweet.likesCount ?? 0);
      const nextLiked = !prevLiked;

      likedMap.value = { ...likedMap.value, [tweet.id]: nextLiked };
      tweet.likesCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

      try {
        const res = await api.toggleLike(tweet.id);
        const actual = Boolean(res?.liked);
        likedMap.value = { ...likedMap.value, [tweet.id]: actual };
        storage.setLiked(currentUser.value.id, tweet.id, actual);
        if (actual !== nextLiked) {
          tweet.likesCount = actual ? prevCount + 1 : Math.max(0, prevCount - 1);
        }
      } catch (err) {
        likedMap.value = { ...likedMap.value, [tweet.id]: prevLiked };
        tweet.likesCount = prevCount;
        feedError.value = err.message || 'Failed to toggle like.';
      }
    }

    async function deleteAsAdmin(tweet) {
      if (!currentUser.value?.isAdmin) return;
      feedError.value = '';
      try {
        await api.adminDeleteTweet(tweet.id);
        tweets.value = tweets.value.filter((t) => t.id !== tweet.id);
        bookmarks.value = bookmarks.value.filter((b) => b.id !== tweet.id);
        if (activeTab.value === 'admin') {
          await loadAdminStats();
        }
      } catch (err) {
        feedError.value = err.message || 'Failed to delete tweet as admin.';
      }
    }

    async function openProfile(userId) {
      if (!userId) return;
      activeTab.value = 'profile';
      profileLoading.value = true;
      profileError.value = '';
      profileMessage.value = '';
      try {
        const [profile, userTweetsData] = await Promise.all([
          api.getProfile(userId),
          api.getUserTweets(userId, 1, 20),
        ]);
        selectedProfile.value = profile;
        profileEdit.value = { name: profile.name || '', bio: profile.bio || '' };
        profileTweets.value = Array.isArray(userTweetsData)
          ? userTweetsData
          : (Array.isArray(userTweetsData?.tweets) ? userTweetsData.tweets : []);
      } catch (err) {
        profileError.value = err.message || 'Failed to load profile.';
      } finally {
        profileLoading.value = false;
      }
    }

    async function saveProfile() {
      if (!selectedProfile.value || !currentUser.value) return;
      profileSaving.value = true;
      profileError.value = '';
      profileMessage.value = '';
      try {
        const updated = await api.updateProfile(selectedProfile.value.userId, {
          name: profileEdit.value.name.trim(),
          bio: profileEdit.value.bio.trim() || null,
        });
        selectedProfile.value = { ...selectedProfile.value, ...updated };
        profileMessage.value = 'Profile updated.';
        await loadFeed(true);
      } catch (err) {
        profileError.value = err.message || 'Failed to update profile.';
      } finally {
        profileSaving.value = false;
      }
    }

    async function loadAdminStats() {
      if (!currentUser.value?.isAdmin) return;
      adminLoading.value = true;
      adminError.value = '';
      try {
        adminStats.value = await api.getAdminStats();
      } catch (err) {
        adminError.value = err.message || 'Failed to load admin stats.';
      } finally {
        adminLoading.value = false;
      }
    }

    async function selectTab(tab) {
      activeTab.value = tab;
      if (tab === 'profile' && !selectedProfile.value && currentUser.value) {
        await openProfile(currentUser.value.id);
      }
      if (tab === 'admin' && currentUser.value?.isAdmin) {
        await loadAdminStats();
      }
    }

    onMounted(async () => {
      await loadFeed(true);
      if (currentUser.value?.isAdmin) {
        await loadAdminStats();
      }
    });

    return {
      theme,
      toggleTheme,
      activeTab,
      selectTab,
      authMode,
      authForm,
      authLoading,
      authError,
      currentUser,
      submitAuth,
      handleLogout,
      draft,
      draftRestored,
      remainingChars,
      composerLoading,
      composerError,
      composerSuccess,
      quoteLoading,
      quoteNotice,
      inspireDraft,
      clearDraft,
      publishTweet,
      tweets,
      filteredTweets,
      searchQuery,
      hasMore,
      feedLoading,
      feedError,
      loadFeed,
      loadMoreTweets,
      editingTweetId,
      editingContent,
      editSaving,
      startEdit,
      cancelEdit,
      saveEdit,
      likedMap,
      toggleLike,
      bookmarks,
      isBookmarked,
      toggleBookmark,
      clearBookmarks,
      failedAvatars,
      avatarUrl,
      markAvatarFailed,
      initials,
      formatDate,
      selectedProfile,
      profileTweets,
      profileLoading,
      profileError,
      profileEdit,
      profileSaving,
      profileMessage,
      openProfile,
      saveProfile,
      adminStats,
      adminLoading,
      adminError,
      loadAdminStats,
      deleteAsAdmin,
    };
  },
}).mount('#vue-app');
