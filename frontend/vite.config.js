import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  plugins: [
    react(),
    mkcert(), // Genera certificado HTTPS local de confianza — habilita cámara en red local
  ],
  server: {
    host: '0.0.0.0',   // Accesible desde celulares en la red local
    port: 5173,
    https: true,       // HTTPS necesario para cámara en dispositivos de red
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
