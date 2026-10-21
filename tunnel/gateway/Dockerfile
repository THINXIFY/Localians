# Localians tunnel gateway — a long-running service (not a serverless function).
# Build the bundle first: `npm run tunnel:build` (produces tunnel/gateway/dist/gateway.js).
# NOTE: not yet built or run in CI — Docker was unavailable in the development environment.
FROM node:24-alpine
WORKDIR /app
COPY tunnel/gateway/dist/gateway.js ./gateway.js
USER node
ENV NODE_ENV=production
# Non-root users can't bind ports below 1024: listen on 8443 and publish it as 443 (e.g. -p 443:8443).
ENV GATEWAY_PORT=8443
# The admin listener (GATEWAY_ADMIN_PORT) binds to loopback inside the container on purpose.
EXPOSE 8443
CMD ["node", "gateway.js"]
