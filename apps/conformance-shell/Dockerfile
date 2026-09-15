# Conformance shell container: assets are built once (`pnpm build:all`); the
# runtime configuration document is generated at container start from
# PLATFORM_* variables by the host entrypoint, so configuration changes never
# rebuild assets. The built SSR handler is served by `vite preview`; a
# deployment would host dist/server/server.js with its own Node adapter.
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build && pnpm --filter conformance-shell build
ENV PORT=4100 HOST=0.0.0.0
EXPOSE 4100
CMD ["node", "apps/conformance-shell/scripts/start.mjs"]
