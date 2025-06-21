@echo off
rem Local development startup script for Windows
echo 🚀 Starting Wiki Platform locally...
echo 📁 Current directory: %CD%

rem Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

rem Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ Node.js version:
node --version
echo ✅ npm version:
npm --version

rem Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

rem Set environment variables for local development
set NODE_ENV=development
if not defined PORT set PORT=5000

echo 🌐 Starting server on http://localhost:%PORT%
echo Press Ctrl+C to stop the server
echo.

rem Start the development server
npm run dev