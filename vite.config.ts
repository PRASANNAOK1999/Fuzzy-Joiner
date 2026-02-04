import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Alias 'buffer' to our local shim file.
      // We use ./ to ensure it resolves relative to this config file.
      buffer: './buffer-shim.ts',
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          // Combine core React and UI libraries to avoid circular dependencies
          'vendor-core': ['react', 'react-dom', 'lucide-react', 'recharts'],
          'vendor-utils': ['xlsx', 'shpjs'],
          'vendor-ai': ['@google/genai'],
        }
      }
    }
  }
});