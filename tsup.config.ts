import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node20',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: false,
    external: ['@lydell/node-pty', 'playwright'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/action.ts'],
    format: ['esm'],
    target: 'node20',
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external: ['@lydell/node-pty', 'playwright'],
  },
])
