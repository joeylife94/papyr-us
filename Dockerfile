# Use the official Node.js 20 image
FROM node:20

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

# Remove build/test-only dependencies from the runtime image.
# This keeps the frozen v1.0 runtime dependency surface limited to production packages.
RUN npm prune --omit=dev --legacy-peer-deps && npm cache clean --force

# Expose port
EXPOSE 5001

# Start the application
CMD ["npm", "start"]
