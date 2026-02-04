import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Alias 'buffer' to our local shim file.
      // This stops Vite from complaining about the missing Node.js 'buffer' module.
      buffer: '/buffer-shim.ts',
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          // Split code into smaller chunks to fix the "Chunk size > 500kB" warning
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['lucide-react', 'recharts'],
          'vendor-utils': ['xlsx', 'shpjs'],
          'vendor-ai': ['@google/genai'],
        }
      }
    }
  }
});