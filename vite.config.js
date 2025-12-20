import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: [
    '**/*.sf2',
    '**/*.sf3',
    '**/*.dls',
    '**/*.mid',
    '**/*.midi',
    '**/*.MID',
    '**/*.MIDI',
  ],
})
