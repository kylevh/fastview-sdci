# Render (Docker) deploy for fastview-sdci API + Playwright/Chromium
#
# Keep this base image version aligned with `playwright` in package.json.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY functions ./functions
COPY server ./server
COPY main.ts ./

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
