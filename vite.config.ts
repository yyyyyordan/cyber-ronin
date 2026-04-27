import { defineConfig } from 'vite';

// Use '/cyber-ronin/' as the base path for the production build (GitHub Pages
// serves the site at https://<user>.github.io/cyber-ronin/). Dev still uses '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cyber-ronin/' : '/',
}));
