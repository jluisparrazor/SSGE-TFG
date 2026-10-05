FROM mcr.microsoft.com/playwright:v1.58.2-noble

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY SSGE_Backend/package.json SSGE_Backend/package-lock.json ./SSGE_Backend/
COPY SSGE_Backend/prisma.config.ts ./SSGE_Backend/
COPY SSGE_Backend/prisma ./SSGE_Backend/prisma
RUN cd /app/SSGE_Backend && DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm ci --omit=dev

COPY SSGE_Scraper/package.json SSGE_Scraper/package-lock.json ./SSGE_Scraper/
RUN cd /app/SSGE_Scraper && npm ci --omit=dev

COPY SSGE_Backend ./SSGE_Backend
COPY SSGE_Scraper ./SSGE_Scraper

WORKDIR /app/SSGE_Backend

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]