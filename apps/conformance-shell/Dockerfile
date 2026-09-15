# Conformance shell container: assets are built once; the runtime configuration
# document is generated at container start from PLATFORM_* variables.
FROM node:22-alpine AS runtime
WORKDIR /app
COPY .output ./.output
COPY ../../packages/host/dist/entrypoint.js ./entrypoint.js
ENV PORT=4100
EXPOSE 4100
CMD ["sh", "-c", "node entrypoint.js --out .output/public/platform-config.json && PLATFORM_CONFIG_PATH=.output/public/platform-config.json node .output/server/index.mjs"]
