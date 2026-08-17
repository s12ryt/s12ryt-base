import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  shims: false,
});
