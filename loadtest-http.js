import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://localhost').replace(/\/+$/, '');
const INSECURE_TLS = (__ENV.INSECURE_TLS || '0') === '1';
const VUS = parseInt(__ENV.VUS || '10', 10);
const DURATION = __ENV.DURATION || '60s';
const USERS_COUNT = parseInt(__ENV.USERS_COUNT || '10', 10);
const TWEETS_PER_USER = parseInt(__ENV.TWEETS_PER_USER || '2', 10);
const THINK_TIME_MS = parseInt(__ENV.THINK_TIME_MS || '150', 10);
const PASSWORD = __ENV.LOADTEST_PASSWORD || 'Test12345!';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 429));

export const rateLimitedReqs = new Counter('rate_limited_reqs');
export const unexpectedErrors = new Rate('unexpected_errors');

export const options = {
  insecureSkipTLSVerify: INSECURE_TLS,
  scenarios: {
    mixed_workload: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    unexpected_errors: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

function jsonHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function recordResult(res, allowedStatuses, endpointTag) {
  if (res.status === 429) {
    rateLimitedReqs.add(1, { endpoint: endpointTag });
    unexpectedErrors.add(0);
    return true;
  }
  const ok = allowedStatuses.includes(res.status);
  unexpectedErrors.add(ok ? 0 : 1);
  return ok;
}

export function setup() {
  const runId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const users = [];
  const tweetIds = [];

  for (let i = 0; i < USERS_COUNT; i++) {
    const email = `k6_${runId}_${i}@loadtest.local`;
    const regRes = http.post(
      `${BASE_URL}/api/registration`,
      JSON.stringify({
        email,
        password: PASSWORD,
        name: `Load User ${i}`,
        bio: 'k6 HTTP benchmark',
      }),
      { headers: jsonHeaders(), tags: { endpoint: 'setup_register' } },
    );
    if (regRes.status !== 201) {
      throw new Error(`Setup registration failed (${regRes.status}): ${regRes.body}`);
    }
    const userId = regRes.json('id');

    const loginRes = http.post(
      `${BASE_URL}/api/token`,
      JSON.stringify({ email, password: PASSWORD }),
      { headers: jsonHeaders(), tags: { endpoint: 'setup_login' } },
    );
    if (loginRes.status !== 200) {
      throw new Error(`Setup login failed (${loginRes.status}): ${loginRes.body}`);
    }
    const token = loginRes.json('token');
    users.push({ id: userId, token });

    for (let j = 0; j < TWEETS_PER_USER; j++) {
      const tweetRes = http.post(
        `${BASE_URL}/api/tweets`,
        JSON.stringify({ content: `k6 seed tweet ${runId} u${i} t${j}` }),
        { headers: jsonHeaders(token), tags: { endpoint: 'setup_tweet' } },
      );
      if (tweetRes.status === 201) {
        tweetIds.push(tweetRes.json('tweetId'));
      }
    }
  }

  if (users.length === 0 || tweetIds.length === 0) {
    throw new Error('Setup failed to seed users and tweets');
  }

  return { users, tweetIds };
}

export default function (data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const roll = Math.random();

  if (roll < 0.60) {
    const res = http.get(`${BASE_URL}/api/tweets?limit=20&page=1`, {
      headers: jsonHeaders(),
      tags: { endpoint: 'feed' },
    });
    const ok = recordResult(res, [200], 'feed');
    check(res, { 'feed status 200': () => ok });
  } else if (roll < 0.80) {
    const targetUser = data.users[Math.floor(Math.random() * data.users.length)];
    const res = http.get(`${BASE_URL}/api/profiles/${targetUser.id}`, {
      headers: jsonHeaders(),
      tags: { endpoint: 'profile' },
    });
    const ok = recordResult(res, [200], 'profile');
    check(res, { 'profile status 200': () => ok });
  } else if (roll < 0.90) {
    const res = http.post(
      `${BASE_URL}/api/tweets`,
      JSON.stringify({ content: `k6 load vu=${__VU} iter=${__ITER}` }),
      { headers: jsonHeaders(user.token), tags: { endpoint: 'create_tweet' } },
    );
    const ok = recordResult(res, [201, 429], 'create_tweet');
    check(res, { 'create tweet 201 or 429': () => ok });
  } else {
    const tweetId = data.tweetIds[Math.floor(Math.random() * data.tweetIds.length)];
    const res = http.post(
      `${BASE_URL}/api/tweets/${tweetId}/likes/toggle`,
      '{}',
      { headers: jsonHeaders(user.token), tags: { endpoint: 'toggle_like' } },
    );
    const ok = recordResult(res, [200, 429], 'toggle_like');
    check(res, { 'toggle like 200 or 429': () => ok });
  }

  if (THINK_TIME_MS > 0) {
    sleep(THINK_TIME_MS / 1000);
  }
}
