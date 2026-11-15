# syntax=docker/dockerfile:1.6
# Build linmour-mobile-web (React/Vite) rồi phục vụ file tĩnh bằng nginx ở cổng 5181.
# Build context: gốc repo

FROM node:20-alpine AS build
WORKDIR /web
COPY linmour-mobile-web/package.json linmour-mobile-web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY linmour-mobile-web/ ./
ARG VITE_VIETQR_BANK_BIN
ARG VITE_VIETQR_ACCOUNT_NO
ARG VITE_VIETQR_ACCOUNT_NAME
ENV VITE_VIETQR_BANK_BIN=${VITE_VIETQR_BANK_BIN} \
    VITE_VIETQR_ACCOUNT_NO=${VITE_VIETQR_ACCOUNT_NO} \
    VITE_VIETQR_ACCOUNT_NAME=${VITE_VIETQR_ACCOUNT_NAME}
RUN npm run build

FROM nginx:1.27-alpine
ENV TZ=Asia/Ho_Chi_Minh
COPY --from=build /web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5181
