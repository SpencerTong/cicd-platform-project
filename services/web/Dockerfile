# =============================================================================
# Stage 1: Builder
# -----------------------------------------------------------------------------
# Uses Node.js 20 Alpine to install dependencies and compile the React app
# into static files. Node is only needed for this step — it doesn't run in
# production.
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files before source code so npm install is cached separately.
# npm ci installs exact versions from package-lock.json — faster and stricter
# than npm install. It fails if package-lock.json is out of sync, which catches
# dependency drift early.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build the production bundle.
# Vite outputs to dist/ — a folder of plain HTML, CSS, and JS files.
COPY . .
RUN npm run build

# =============================================================================
# Stage 2: Serve
# -----------------------------------------------------------------------------
# Uses a bare nginx Alpine image. No Node.js, no npm, no source code.
# nginx just serves the static files from Stage 1.
# =============================================================================
FROM nginx:alpine

# Remove nginx's default config and replace with ours.
# Our config adds the /api proxy rule that routes API requests to the
# Spring Boot container on the Docker Compose network.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled static files from Stage 1 into nginx's serving directory.
COPY --from=builder /app/dist /usr/share/nginx/html

# Document that nginx listens on port 80 inside the container.
EXPOSE 80
