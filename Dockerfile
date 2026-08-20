# Use the official Node.js 20 slim image to keep the frozen v1.0 runtime OS surface bounded.
FROM node:20-bookworm-slim

# Apply available Debian security updates before installing application dependencies.
# GAP-007 runtime evidence showed fixable HIGH/CRITICAL OS packages in the base image.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove build/test-only dependencies and the package-manager toolchain from the runtime image.
# The application starts with node directly, so npm/npx are not runtime requirements.
RUN npm prune --omit=dev --legacy-peer-deps \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV PORT=5001

# Expose port
EXPOSE 5001

# Start the built application without retaining npm in the runtime image.
CMD ["node", "dist/server/index.js"]
