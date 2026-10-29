import { defineConfig } from 'vite';

// GitHub Pages 的项目站点部署在 /<repo>/ 下，因此 base 由部署工作流注入；
// 本地开发与预览保持根路径。
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
    port: 5173,
  },
});
