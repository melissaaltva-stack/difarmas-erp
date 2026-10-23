import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages publishes this repository under /difarmas-erp/.
  // Vercel serves the app from the domain root, so its assets must use /.
  base: process.env.VERCEL ? '/' : '/difarmas-erp/',
});
