# Home Kitchen app image (Docker / offline installs). Built on the client's machine by deploy/docker-compose.yml.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ":8000" = Supabase on port 8000 of whatever address staff open the app from (laptop, tablet, phone on shop Wi-Fi)
ARG NEXT_PUBLIC_SUPABASE_URL=:8000
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AUTH_COOKIE=sb-hk-auth-token
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_AUTH_COOKIE=$NEXT_PUBLIC_AUTH_COOKIE \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
# Placeholders so the build doesn't need the real server secrets (they're read at run time).
RUN SUPABASE_SERVICE_ROLE_KEY=build npm run build

FROM node:22-alpine
# psql / pg_dump for migrations and backups; tzdata for the shop's time zone
RUN apk add --no-cache postgresql17-client tzdata
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY supabase ./supabase
COPY deploy/scripts ./deploy/scripts
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 CMD wget -qO- http://127.0.0.1:3000/app-icon/192 >/dev/null || exit 1
CMD ["node", "server.js"]
