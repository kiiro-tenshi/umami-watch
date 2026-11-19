import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    hmr: {
      host: 'localhost',
      clientPort: 5173,
    },
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/ },
            { name: 'vendor-firebase', test: /[\\/]node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'vendor-player', test: /[\\/]node_modules[\\/](plyr|hls\.js)[\\/]/ },
            { name: 'vendor-emoji', test: /[\\/]node_modules[\\/](@emoji-mart|emoji-mart)[\\/]/ },
            { name: 'vendor-socket', test: /[\\/]node_modules[\\/]socket\.io-client[\\/]/ },
          ],
        },
      },
    },
  },
});
