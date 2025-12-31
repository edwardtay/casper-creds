#!/bin/bash

# CasperCreds Deployment Script
# Deploys the credential verification contract to Casper testnet

set -e

echo "🚀 CasperCreds Deployment Script"
echo "================================"

# Configuration
NETWORK="casper-test"
NODE_ADDRESS="https://rpc.testnet.casperlabs.io/rpc"
CHAIN_NAME="casper-test"
PAYMENT_AMOUNT="50000000000" # 50 CSPR for deployment

# Check for required tools
if ! command -v casper-client &> /dev/null; then
    echo "❌ casper-client not found. Please install it first."
    echo "   Visit: https://docs.casper.network/developers/prerequisites/"
    exit 1
fi

# Check for secret key
if [ -z "$CASPER_SECRET_KEY" ]; then
    echo "❌ CASPER_SECRET_KEY environment variable not set"
    echo "   Export your secret key path: export CASPER_SECRET_KEY=/path/to/secret_key.pem"
    exit 1
fi

# Build the contract
echo ""
echo "📦 Building contract..."
cd contracts
cargo build --release --target wasm32-unknown-unknown

# Optimize WASM
echo ""
echo "⚡ Optimizing WASM..."
wasm-strip target/wasm32-unknown-unknown/release/casper_credentials.wasm 2>/dev/null || true

WASM_PATH="target/wasm32-unknown-unknown/release/casper_credentials.wasm"

if [ ! -f "$WASM_PATH" ]; then
    echo "❌ WASM file not found at $WASM_PATH"
    exit 1
fi

echo "✅ Contract built successfully"
echo "   Size: $(du -h $WASM_PATH | cut -f1)"

# Deploy to testnet
echo ""
echo "🌐 Deploying to $NETWORK..."

DEPLOY_HASH=$(casper-client put-deploy \
    --node-address "$NODE_ADDRESS" \
    --chain-name "$CHAIN_NAME" \
    --secret-key "$CASPER_SECRET_KEY" \
    --payment-amount "$PAYMENT_AMOUNT" \
    --session-path "$WASM_PATH" \
    | jq -r '.result.deploy_hash')

echo "✅ Deploy submitted!"
echo "   Deploy hash: $DEPLOY_HASH"

# Wait for deployment
echo ""
echo "⏳ Waiting for deployment to be processed..."
sleep 30

# Get deploy status
casper-client get-deploy \
    --node-address "$NODE_ADDRESS" \
    "$DEPLOY_HASH"

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Note your contract hash from the deploy result"
echo "2. Update CONTRACT_HASH in frontend/src/utils/casper.ts"
echo "3. Run the frontend: cd frontend && npm run dev"
