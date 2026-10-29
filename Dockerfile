# Production build of the dashboard, served by nginx. /api/ is proxied to the QbAutopost API so the browser sees one
# origin (R-2): the SameSite=Strict refresh cookie works and no CORS is needed.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://api:5080
EXPOSE 80
