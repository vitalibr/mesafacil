/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: o site é servido em https://<usuario>.github.io/mesafacil/
export default defineConfig({
  base: '/mesafacil/',
  plugins: [react(), tailwindcss()],
  // o Three.js (~580 kB) fica num pacote separado, carregado só ao abrir a aba 3D
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
