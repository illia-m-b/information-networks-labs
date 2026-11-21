document.addEventListener('DOMContentLoaded', async () => {
  const alerts = document.getElementById('admin-alerts');
  const accessDenied = document.getElementById('admin-access-denied');
  const adminPanel = document.getElementById('admin-panel');
  const tweetsBody = document.getElementById('admin-tweets-body');

  function showAccessDenied() {
    if (adminPanel) adminPanel.style.display = 'none';
    if (accessDenied) accessDenied.style.display = 'block';
  }

  async function loadStats() {
    const stats = await Api.get(window.routes.adminStats);
    document.getElementById('stat-users').textContent = String(stats.usersCount ?? 0);
    document.getElementById('stat-tweets').textContent = String(stats.tweetsCount ?? 0);
    document.getElementById('stat-likes').textContent = String(stats.likesCount ?? 0);
  }

  function renderEmptyRow() {
    tweetsBody.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'text-muted text-center';
    cell.textContent = 'No tweets found';
    row.appendChild(cell);
    tweetsBody.appendChild(row);
  }

  function renderTweetRow(tweet) {
    const row = document.createElement('tr');

    const authorCell = document.createElement('td');
    authorCell.textContent = tweet?.author?.name || 'Unknown';

    const contentCell = document.createElement('td');
    contentCell.textContent = tweet?.content || '';

    const likesCell = document.createElement('td');
    likesCell.textContent = String(tweet?.likesCount ?? 0);

    const createdCell = document.createElement('td');
    createdCell.className = 'text-nowrap small text-muted';
    createdCell.textContent = tweet?.createdAt ? new Date(tweet.createdAt).toLocaleString() : '';

    const actionCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.textContent = 'Delete';

    deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled = true;
      try {
        const url = window.buildRoute(window.routes.adminDeleteTweet, { tweetId: tweet.id });
        const response = await Api._request(url, { method: 'DELETE' });

        if (response.status === 204) {
          row.remove();
          if (tweetsBody.children.length === 0) {
            renderEmptyRow();
          }
          await loadStats();
          Alert.append(alerts, 'Tweet deleted successfully', 'success');
          return;
        }

        if (response.status === 401 || response.status === 403) {
          showAccessDenied();
          return;
        }

        Alert.append(alerts, `Failed to delete tweet (HTTP ${response.status})`, 'danger');
      } catch (_) {
        Alert.append(alerts, 'Failed to delete tweet', 'danger');
      } finally {
        deleteBtn.disabled = false;
      }
    });

    actionCell.appendChild(deleteBtn);
    row.appendChild(authorCell);
    row.appendChild(contentCell);
    row.appendChild(likesCell);
    row.appendChild(createdCell);
    row.appendChild(actionCell);

    return row;
  }

  const token = await Api.ensureValidToken();
  if (!token || !Auth.isAdmin(token)) {
    showAccessDenied();
    return;
  }

  try {
    Loading.clearAndShow(alerts, 'Loading moderation dashboard...');
    const [, feed] = await Promise.all([
      loadStats(),
      Api.get(`${window.routes.getTweets}?limit=50&page=1`),
    ]);
    Loading.hide(alerts);

    adminPanel.style.display = 'block';
    const tweets = Array.isArray(feed?.tweets) ? feed.tweets : [];
    if (tweets.length === 0) {
      renderEmptyRow();
      return;
    }

    tweetsBody.replaceChildren();
    for (const tweet of tweets) {
      tweetsBody.appendChild(renderTweetRow(tweet));
    }
  } catch (error) {
    Loading.hide(alerts);
    if (error?.status === 401 || error?.status === 403) {
      showAccessDenied();
      return;
    }
    Alert.append(alerts, 'Failed to load admin dashboard', 'danger');
  }
});
