import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // In development (npm run dev), Vite proxies /api requests to the Spring Boot
    // API running locally on port 8080. This mirrors the nginx proxy config used
    // in the Docker image, so the React code works identically in both environments.
    proxy: {
      '/api': 'http://localhost:8080'
    }
  }
})
