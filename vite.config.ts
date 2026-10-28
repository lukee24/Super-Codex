import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'./',server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/release/**','**/artifacts/**','**/.cache/**']}},build:{chunkSizeWarningLimit:850,rollupOptions:{output:{manualChunks:{three:['three'],markdown:['react-markdown','remark-gfm']}}}}});
