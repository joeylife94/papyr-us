#!/bin/bash

# Local development startup script
echo "🚀 Starting Wiki Platform locally..."
echo "📁 Current directory: $(pwd)"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Set environment variables for local development
export NODE_ENV=development
export PORT=${PORT:-5001}

echo "🌐 Starting server on http://localhost:${PORT}"
echo "Press Ctrl+C to stop the server"
echo ""

# Start the development server
npm run dev