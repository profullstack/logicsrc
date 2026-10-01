# syntax=docker/dockerfile:1
#
# logicsrc.com and app.logicsrc.com, run on Bun. One image serves both sites.
#
# This file lives at .nixpacks/Dockerfile because that is the path dev2's compose
# stacks build (cli-tools dev2/dev2-site provision records it per site, and
# re-provisioning keeps it). It used to be nixpacks output (Node + npm); it is now
# a hand-written Bun image, so do not regenerate it with nixpacks.
#
# Contract with dev2, unchanged from the Node image:
# - Listens on 3000 inside the container and answers / for the deploy health check.
# - ENTRYPOINT is `bash -l -c`, so a compose `command:` is ONE string, as before.
#   logicsrc.com uses the default CMD; app.logicsrc.com's compose overrides it
#   with "npm --workspace @logicsrc/pwa run start", which .nixpacks/npm (the
#   image's `npm`) turns into `bun run start` in apps/pwa.
# - Takes the PUBLIC_URL build arg; secrets come from app.env at run time.
#
# The whole workspace tree ships, not a Next standalone bundle: app.logicsrc.com
# runs apps/pwa (Express) from the same image, with its own dependencies.
#
# Bun 1.4.2, not the fleet's usual 1.4.0: 1.4.0 re-resolves this workspace's
# `file:` cross-references differently on every install, so its own lockfile
# never passes --frozen-lockfile. 1.4.2 is stable on it.

FROM oven/bun:1.4.2-slim AS build
WORKDIR /app
ARG PUBLIC_URL
ENV PUBLIC_URL=$PUBLIC_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN bun install --frozen-lockfile
# Every workspace build (tsc, vite, `bun --bun next build`), in dependency order.
RUN bun run build

FROM oven/bun:1.4.2-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build --chown=bun:bun /app /app
COPY --chown=root:root .nixpacks/npm /usr/local/bin/npm
# The oven/bun image ships a non-root `bun` user.
USER bun
EXPOSE 3000
ENTRYPOINT ["/bin/bash", "-l", "-c"]
# logicsrc.com: Next's own entry file run directly by Bun, one process, no
# wrapper (`bun run start` would leave three bun processes stacked up).
CMD ["cd apps/logicsrc-web && exec bun --bun /app/node_modules/next/dist/bin/next start"]
