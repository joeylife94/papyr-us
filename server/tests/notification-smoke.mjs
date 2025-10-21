import { io } from 'socket.io-client';

async function ensureMember(baseUrl, email, authHeader) {
  // Try to fetch by email first
  try {
    const res = await fetch(`${baseUrl}/api/members/email/${encodeURIComponent(email)}`, {
      headers: authHeader
        ? { Authorization: authHeader, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {}

  // Create new member
  const body = {
    name: 'Smoke Member',
    email,
    role: 'tester',
  };
  const res = await fetch(`${baseUrl}/api/members`, {
    method: 'POST',
    headers: authHeader
      ? { Authorization: authHeader, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to create member: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function createNotification(baseUrl, recipientId, authHeader) {
  const payload = {
    type: 'test',
    title: 'Smoke Notification',
    content: 'Hello from smoke test',
    recipientId,
  };
  const res = await fetch(`${baseUrl}/api/notifications`, {
    method: 'POST',
    headers: authHeader
      ? { Authorization: authHeader, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create notification: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function run() {
  const port = process.env.PORT || '5002';
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const nsUrl = process.env.SOCKET_URL || `${baseUrl}/collab`;
  const token = process.env.JWT_TOKEN || process.env.TOKEN;
  const authHeader = token ? `Bearer ${token}` : undefined;

  console.log('[notification-smoke] Using baseUrl=', baseUrl);
  console.log('[notification-smoke] Connecting to', nsUrl);

  // Prepare a unique email for each run
  const uniqueEmail = `smoke-${Date.now()}@example.com`;
  const member = await ensureMember(baseUrl, uniqueEmail, authHeader);
  console.log('[notification-smoke] Target member id:', member.id, 'email:', member.email);

  const socket = io(nsUrl, {
    transports: ['websocket', 'polling'],
    auth: token ? { token } : undefined,
  });

  const onDone = (code) => {
    try {
      socket.disconnect();
    } catch (_) {}
    process.exit(code);
  };

  const timeout = setTimeout(() => {
    console.error('[notification-smoke] timeout waiting for event');
    onDone(3);
  }, 15000);

  socket.on('connect', async () => {
    console.log('[notification-smoke] socket connected:', socket.id);
    socket.emit('join-member', { memberId: member.id });

    // After joining room, trigger a notification create
    try {
      await createNotification(baseUrl, member.id, authHeader);
    } catch (err) {
      console.error('[notification-smoke] createNotification error', err);
      clearTimeout(timeout);
      return onDone(2);
    }
  });

  socket.on('notification:new', (notif) => {
    try {
      if (notif && notif.recipientId === member.id) {
        console.log('[notification-smoke] received notification:new for member', notif);
        clearTimeout(timeout);
        onDone(0);
      }
    } catch (err) {
      console.error('[notification-smoke] handler error', err);
    }
  });

  socket.on('connect_error', (err) => {
    console.error('[notification-smoke] connect_error', err.message || err);
    clearTimeout(timeout);
    onDone(2);
  });
}

run().catch((err) => {
  console.error('notification-smoke fatal error', err);
  process.exit(1);
});
