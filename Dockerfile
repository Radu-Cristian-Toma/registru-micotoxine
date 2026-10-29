# LIMS Registru Micotoxine — imagine de execuție (Etapa E). Date în volumul /data.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 13 conține binare precompilate (linux x64/arm64, glibc și musl): scripturile de compilare nu sunt necesare.
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    LIMS_HOST=0.0.0.0 \
    LIMS_TRUST_PROXY=1 \
    LIMS_DB_PATH=/data/lims.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chmod +x docker/entrypoint.sh && mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/me').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker/entrypoint.sh"]
