import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// root задаётся явно: конфиг запускается из корня пакета, а index.html лежит здесь
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [vue()],
  // относительные пути обязательны: в webview страница отдаётся с vscode-cdn,
  // абсолютный /assets/... там никуда не ведёт
  base: './',
  build: {
    outDir: '../media',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        // фиксированные имена без хэша — панель строит URI сама, без чтения манифеста
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
