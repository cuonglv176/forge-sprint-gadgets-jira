#!/bin/bash

# ========================================
# Sprint Dashboard Gadgets - Setup Script
# ========================================

set -e

echo "🚀 Sprint Dashboard Gadgets Setup"
echo "=================================="

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ is required. Please install from https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required"
    exit 1
fi
echo "✅ npm version: $(npm -v)"

# Check Forge CLI
if ! command -v forge &> /dev/null; then
    echo "📦 Installing Forge CLI..."
    npm install -g @forge/cli
fi
echo "✅ Forge CLI version: $(forge --version)"

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
npm install

# Install frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd static/gadget
npm install

# Build frontend
echo ""
echo "🏗️ Building frontend..."
npm run build
cd ../..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Login to Atlassian: forge login"
echo "  2. Register app:       forge register"
echo "  3. Deploy app:         forge deploy"
echo "  4. Install to Jira:    forge install --site YOUR-SITE.atlassian.net"
echo ""
