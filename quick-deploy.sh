#!/bin/bash

# ===================================================================
# QUICK DEPLOY SCRIPT - Jira Sprint Dashboard Gadgets v2.1
# ===================================================================
# Usage: ./quick-deploy.sh
# ===================================================================

set -e  # Exit on error

echo "================================================"
echo "🚀 Jira Sprint Dashboard Gadgets v2.1"
echo "================================================"
echo ""

# Check Node version
echo "📋 Checking prerequisites..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Error: Node.js version must be >= 20.x"
    echo "   Current version: $(node -v)"
    echo "   Please upgrade Node.js: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Check Forge CLI
if ! command -v forge &> /dev/null; then
    echo "❌ Error: Forge CLI not found"
    echo "   Install it with: npm install -g @forge/cli"
    exit 1
fi
echo "✅ Forge CLI version: $(forge --version)"

# Check if logged in
if ! forge whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Forge"
    echo "   Please run: forge login"
    exit 1
fi
echo "✅ Logged in to Forge"
echo ""

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install
echo "✅ Root dependencies installed"
echo ""

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd static/gadget
npm install
echo "✅ Frontend dependencies installed"
echo ""

# Build frontend
echo "🔨 Building frontend..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Error: Frontend build failed"
    exit 1
fi
echo "✅ Frontend built successfully"
cd ../..
echo ""

# Deploy to Jira Cloud
echo "🚀 Deploying to Jira Cloud..."
forge deploy
if [ $? -ne 0 ]; then
    echo "❌ Error: Deployment failed"
    exit 1
fi
echo "✅ Deployed successfully"
echo ""

# Ask about installation
echo "================================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Install app to your Jira site:"
echo "   $ forge install"
echo ""
echo "2. Add gadgets to your dashboard:"
echo "   - Go to Jira → Dashboard → Add gadget"
echo "   - Search for 'Sprint Burndown Chart v2.1'"
echo "   - Configure and enjoy!"
echo ""
echo "For more details, see:"
echo "  - README.md (English)"
echo "  - DEPLOY_GUIDE_VI.md (Vietnamese)"
echo ""

# Ask to install now
read -p "Do you want to install the app now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    forge install
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "🎉 All done! Go to your Jira dashboard and add the gadgets."
else
    echo ""
    echo "You can install later with: forge install"
fi

echo ""
echo "================================================"
echo "🎊 Happy Sprint Management!"
echo "================================================"
