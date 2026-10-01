import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        passportPhoto: 'passport-photo.html',
        resumeMaker: 'resume-maker.html',
        pdfCompressor: 'pdf-compressor.html',
        idCardPrint: 'id-card-print.html',
        signatureValidator: 'signature-validator.html',
      },
    },
  },
});
