import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages publishes this repository under /difarmas-erp/.
  base: '/difarmas-erp/',
});
