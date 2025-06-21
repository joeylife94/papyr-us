# Use the official Node.js 18 image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build the application and apply fix
RUN npm run build && node build-fix.js

# Clean up dev dependencies
RUN npm ci --only=production && npm cache clean --force

# Expose port
EXPOSE 10000

# Start the application
CMD ["npm", "start"]