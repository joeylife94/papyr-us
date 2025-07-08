# Use the official Node.js 18 image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the application and apply fix
RUN npm run build && node build-fix.js

# Clean up dev dependencies - (We keep them for dev commands inside the container)
# RUN npm ci --only=production && npm cache clean --force

# Expose port
EXPOSE 5001

# Start the application - (We'll override this in docker-compose)
# CMD ["npm", "start"]