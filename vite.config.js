import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        passportPhoto: 'passport-photo.html',
        resumeMaker: 'resume-maker.html',
        pdfCompressor: 'pdf-compressor.html',
        idCardPrint: 'id-card-print.html',
        signatureValidator: 'signature-validator.html',
        easyCrop: 'easy-crop.html',
      },
    },
  },
});
