# Anvi E-mitra & CSC Centre — React + Vite

A mobile-first digital-service shop website built with React, Vite and `motion/react`, following the UI/UX Pro Max principles.

## Included
- Hero section with fade-up entrance motion
- Responsive navigation
- E-mitra / CSC service categories
- Search + category filters
- Service enquiry list / cart
- WhatsApp enquiry flow
- How-it-works section
- Contact section
- Accessible labels and focus states
- Reduced-motion support
- Mobile layouts for 375px+ screens

## Setup
```bash
npm install
npm run dev
```

## Production
```bash
npm run build
```

Upload the generated `dist/` folder to your preferred static hosting, or deploy the repository with a Vite-compatible GitHub Pages workflow.

## IMPORTANT: Replace placeholders
Open `src/main.jsx` and replace:
- `PHONE`
- `DISPLAY_PHONE`
- shop address
- business hours if different

Do not collect Aadhaar, PAN, OTP, passwords, bank PINs or other sensitive credentials through a static website form.

## Design direction
The interface uses a trustworthy local-service visual system: deep navy, warm white and restrained saffron/gold accents; readable sans-serif typography; clear hierarchy; touch-friendly controls; no emoji icons; subtle motion with `prefers-reduced-motion` support.
