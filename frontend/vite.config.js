import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@tensorflow/tfjs')) return 'tfjs'
          if (id.includes('pixi.js') || id.includes('pixi-filters')) return 'pixi'
          if (id.includes('spessasynth_lib')) return 'spessasynth'
          if (
            id.includes('aubiojs') ||
            id.includes('pitchy') ||
            id.includes('pitchfinder') ||
            id.includes('spectrogram')
          ) {
            return 'audio'
          }
          return 'vendor'
        },
      },
    },
  },
  assetsInclude: [
    '**/*.sf2',
    '**/*.sf3',
    '**/*.dls',
    '**/*.mid',
    '**/*.midi',
    '**/*.MID',
    '**/*.MIDI',
    '**/engine/audio/pitch/model/crepe/*',
  ],
})
