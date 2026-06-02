import { defineConfig } from 'vite'
import { aperture } from '@halvo/aperture/vite'

export default defineConfig({
  plugins: [aperture()],
})
