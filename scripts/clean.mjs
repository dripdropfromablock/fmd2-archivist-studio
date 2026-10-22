import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
rmSync('server.js', { force: true });
