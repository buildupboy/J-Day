import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        // 해석 + 배치 + 한 번의 검증 교정까지 백엔드 응답을 기다린다.
        proxyTimeout: 420000,
        timeout: 420000,
      },
    },
  },
});
