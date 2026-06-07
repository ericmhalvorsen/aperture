import { defineConfig } from 'vite'
import { aperture } from '@ericmhalvorsen/aperture/vite'

export default defineConfig({
  plugins: [aperture()],
})
