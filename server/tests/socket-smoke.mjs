import { io } from 'socket.io-client';

async function run() {
  const port = process.env.PORT || '5001';
  const url = process.env.SOCKET_URL || `http://localhost:${port}/collab`;
  console.log('Connecting to', url);
  const token = process.env.JWT_TOKEN || process.env.TOKEN;
  const socket = io(url, {
    transports: ['websocket', 'polling'],
    auth: token ? { token } : undefined,
  });

  socket.on('connect', () => {
    console.log('connected, id=', socket.id);
    // send join-document
    socket.emit('join-document', {
      pageId: 9999,
      userId: 'smoke-1',
      userName: 'Smoke Tester',
      ...(token ? { token } : {}),
    });

    // request current session users by listening
  });

  socket.on('session-users', (users) => {
    console.log('session-users:', users);
    socket.disconnect();
    process.exit(0);
  });

  socket.on('connect_error', (err) => {
    console.error('connect_error', err.message || err);
    process.exit(2);
  });

  // timeout
  setTimeout(() => {
    console.error('smoke test timeout');
    socket.disconnect();
    process.exit(3);
  }, 10000);
}

run().catch((err) => {
  console.error('error', err);
  process.exit(1);
});
