import { io } from 'socket.io-client';

const baseUrl = process.env.FIREBAT_BASE_URL || 'http://127.0.0.1:8801';
const email = process.env.FIREBAT_SMOKE_EMAIL || 'firebat-ci@example.com';
const password = process.env.FIREBAT_SMOKE_PASSWORD || 'FirebatSmoke!123';
const name = process.env.FIREBAT_SMOKE_NAME || 'Firebat CI';

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function getCookieHeader(response) {
  const values =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

const health = await jsonRequest('/health');
if (!health.response.ok || health.body.status !== 'healthy') {
  throw new Error(`health smoke failed: ${health.response.status} ${JSON.stringify(health.body)}`);
}

const version = await jsonRequest('/version');
if (!version.response.ok || !version.body.revision || version.body.revision === 'unknown') {
  throw new Error(`version smoke failed: ${version.response.status} ${JSON.stringify(version.body)}`);
}

const registration = await jsonRequest('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ name, email, password }),
});
if (![201, 409].includes(registration.response.status)) {
  throw new Error(
    `registration smoke failed: ${registration.response.status} ${JSON.stringify(registration.body)}`
  );
}

const login = await jsonRequest('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
if (!login.response.ok || login.body?.user?.email !== email) {
  throw new Error(`login smoke failed: ${login.response.status} ${JSON.stringify(login.body)}`);
}

const cookie = getCookieHeader(login.response);
if (!cookie.includes('accessToken=')) {
  throw new Error('login smoke did not return an accessToken cookie');
}

await new Promise((resolve, reject) => {
  const socket = io(`${baseUrl}/collab`, {
    transports: ['websocket'],
    timeout: 10_000,
    reconnection: false,
    extraHeaders: { Cookie: cookie },
  });

  const timer = setTimeout(() => {
    socket.close();
    reject(new Error('WebSocket smoke timed out'));
  }, 12_000);

  socket.on('connect', () => {
    clearTimeout(timer);
    socket.close();
    resolve();
  });
  socket.on('connect_error', (error) => {
    clearTimeout(timer);
    socket.close();
    reject(new Error(`WebSocket smoke failed: ${error.message}`));
  });
});

console.log(
  JSON.stringify({
    status: 'passed',
    health: health.body.status,
    revision: version.body.revision,
    login: email,
    websocket: 'connected',
  })
);
