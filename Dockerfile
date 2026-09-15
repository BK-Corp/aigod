# AI RADAR — aigod
#
# The live-data API proxies (aircraft, satellites, traffic, fires, CCTV, ...) are
# Vite dev-server plugins (configureServer) — they do NOT exist under
# `vite preview`. The container therefore runs the Vite dev server, exactly as
# the app's own launcher does. It serves the app at base /aigod/ and its proxies
# at the root /api/ namespace, which the aistore gateway routes here.
FROM node:24-alpine

WORKDIR /app

# Full dependency tree is required: vite + its plugins run the server at runtime.
# puppeteer/sharp are only used by the qa scripts, never by the server, so skip
# their heavy native/Chromium downloads (the upstream CI does the same).
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# HOST=0.0.0.0 also flips vite's allowedHosts to true, so the gateway's Host
# header (ai.bkholding.vn) is accepted.
# WARNING: this exposes the app's key-brokering proxies beyond localhost — see
# SECURITY.md. The app is designed to run local-first.
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8000/aigod/ || exit 1

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "8000", "--strictPort"]