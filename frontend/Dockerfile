# Web BFC (Next.js). Chỉ build trên server / CI, máy dev không dùng Docker (backend/docs/adr/0006).
# Ghim phiên bản image chính xác. Build từ deploy/docker-compose.yml, xem deploy/README.md.
#
# Lúc build Next dựng sẵn trang và GỌI CMS: CMS phải đang chạy và đã có dữ liệu, CMS_API_URL lúc build
# là địa chỉ công khai (https://cms.<domain>/api/v1). Lúc chạy, compose đặt lại CMS_API_URL nội bộ
# (http://cms:8000/api/v1). Build không có CMS_API_URL thì trang dựng bằng dữ liệu mock (chỉ dùng ở CI).

# ---------------------------------------------------------------- cài thư viện đúng package-lock
FROM node:20.20.2-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- build
FROM node:20.20.2-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Đọc trong next.config.ts (nguồn ảnh, CSP khung xem trước) và khi dựng sẵn trang (canonical, sitemap)
ARG CMS_API_URL=""
ARG CMS_ADMIN_ORIGIN=""
# Khoá công khai captcha (NEXT_PUBLIC_* được gắn cứng vào JS lúc build)
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ARG SITE_URL=""
ENV CMS_API_URL=$CMS_API_URL \
    CMS_ADMIN_ORIGIN=$CMS_ADMIN_ORIGIN \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    SITE_URL=$SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------- chạy: chỉ bản standalone, user thường
FROM node:20.20.2-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
