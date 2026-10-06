# Image for the hosted endpoint, https://mcp.apexcharts.com/mcp.
#
#   docker build -t apexcharts-mcp:production .
#   docker run -d --name apexcharts-mcp-production --restart unless-stopped \
#     -p 127.0.0.1:3100:3000 --memory=256m --log-opt max-size=50m \
#     apexcharts-mcp:production
#
# Configure through environment variables, not CLI flags: the HEALTHCHECK reads
# PORT, so a --port flag would leave it polling the wrong port.

FROM node:22-alpine AS build
WORKDIR /app
COPY . .
# `npm ci` runs the root `prepare` script, which is the full build
# (tsc -b, then the esbuild bundle into dist/index.js).
RUN npm ci \
 && npm prune --omit=dev \
 # The bundle inlines every @apexcharts-mcp/* workspace package; these are
 # symlinks into packages/, which the runtime stage does not copy.
 && rm -rf node_modules/@apexcharts-mcp

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    APEXCHARTS_MCP_HOST=0.0.0.0 \
    # localhost and 127.0.0.1 let on-box smoke tests reach /mcp directly.
    APEXCHARTS_MCP_ALLOWED_HOSTS=mcp.apexcharts.com,localhost,127.0.0.1 \
    # Public, read-only, no credentials: any browser page may call it.
    APEXCHARTS_MCP_ALLOWED_ORIGINS=* \
    # Keep the V8 heap inside the container's 256m ceiling, so a leak shows
    # up as a heap error in the log rather than a silent kernel OOM kill.
    NODE_OPTIONS=--max-old-space-size=192
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1
CMD ["node", "dist/index.js", "--http"]
