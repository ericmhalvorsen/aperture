import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aperture } from '@halvo/aperture/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aperture()],
})
