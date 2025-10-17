const fs = require('fs');
const path = require('path');

const snapshotsDir = path.resolve(process.cwd(), 'data', 'collab-snapshots');
if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

module.exports = {
  async saveSnapshot(documentId, buffer) {
    const snapPath = path.join(snapshotsDir, `${documentId}.bin`);
    if (Buffer.isBuffer(buffer)) {
      fs.writeFileSync(snapPath, buffer);
    } else if (typeof buffer === 'string') {
      fs.writeFileSync(snapPath, Buffer.from(buffer, 'base64'));
    }
    return { ok: true, path: snapPath };
  },

  async loadSnapshot(documentId) {
    const snapPath = path.join(snapshotsDir, `${documentId}.bin`);
    if (!fs.existsSync(snapPath)) return null;
    const buf = fs.readFileSync(snapPath);
    return buf;
  },
};
