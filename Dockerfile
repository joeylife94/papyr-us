# Use the official Node.js 20 Alpine image to minimize the frozen v1.0 runtime OS surface.
FROM node:20-alpine

# Apply available Alpine security updates before installing application dependencies.
# GAP-007 runtime evidence on the Debian slim candidate still showed 22 HIGH/CRITICAL OS findings.
RUN apk upgrade --no-cache

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
