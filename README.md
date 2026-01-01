# CasperCreds

Verifiable credentials on Casper blockchain. Issue, verify, revoke.

[![Live](https://img.shields.io/badge/Demo-casper--creds.vercel.app-blue)](https://casper-creds.vercel.app)
[![Contract](https://img.shields.io/badge/Contract-Testnet-green)](https://testnet.cspr.live/contract-package/fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  Casper RPC │────▶│  Contract   │
│  React/Vite │     │   (Proxy)   │     │   (Odra)    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       ▼                                       ▼
┌─────────────┐                         ┌─────────────┐
│    IPFS     │                         │  On-chain   │
│  (Pinata)   │                         │   Storage   │
└─────────────┘                         └─────────────┘
```

**On-chain:** issuer, holder, type, title, expiry, metadataHash, revoked  
**Off-chain (IPFS):** full metadata JSON, images

## Contract

```
hash: fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973
network: casper-test
```

Entry points:
- `issue(holder, credential_type, title, expires_at, metadata_hash)` — 5 CSPR gas
- `revoke(id, reason)` — 3 CSPR gas
- `verify(id)` — read-only

## Stack

| Layer | Tech |
|-------|------|
| Contract | Rust + Odra framework |
| Frontend | React 18 + Vite + TailwindCSS |
| Wallet | CSPR.click SDK + Casper Wallet extension |
| Storage | IPFS via Pinata |
| OCR | Tesseract.js (client-side) |
| Deploy | Vercel |

## Run

```bash
cd frontend && npm i && npm run dev
```

## Env

```bash
# frontend/.env
VITE_CONTRACT_HASH=contract-package-fc4506f2...
VITE_CASPER_NETWORK=casper-test
VITE_PINATA_API_KEY=xxx        # optional
VITE_PINATA_SECRET_KEY=xxx     # optional
```

## Contract Dev

```bash
cd contracts
cargo odra build
cargo odra test
```

Deploy via `cargo odra deploy` or manual wasm upload.

## Notes

- Issuing requires Casper Wallet extension (not social login) + testnet CSPR for gas
- CSPR.click social login works for viewing/holding credentials only
- RPC calls proxied through `/api/rpc` to avoid CORS
- Tesseract runs entirely client-side, no server OCR

## License

MIT
