# CasperCreds 🎓

**Decentralized Verifiable Credentials on Casper Blockchain**

Issue, verify, and manage tamper-proof credentials — degrees, certificates, licenses, employment records — all secured on-chain.

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-casper--creds.vercel.app-blue?style=for-the-badge)](https://casper-creds.vercel.app)
[![Contract](https://img.shields.io/badge/📜_Contract-Testnet-green?style=for-the-badge)](https://testnet.cspr.live/contract-package/baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0)
[![Casper](https://img.shields.io/badge/Built_on-Casper_Network-red?style=for-the-badge)](https://casper.network)

---

## 🏆 Casper Hackathon 2026 Submission

### The Problem
- **$600B+** lost annually to credential fraud
- **40%** of resumes contain falsified credentials
- Manual verification takes **days to weeks**
- Centralized databases are **hackable and siloed**

### Our Solution
CasperCreds brings verifiable credentials to the blockchain:
- ✅ **Instant verification** — Query blockchain in seconds
- ✅ **Tamper-proof** — Immutable on-chain records
- ✅ **Decentralized** — No single point of failure
- ✅ **Privacy-preserving** — Holder controls sharing
- ✅ **NFT Credentials** — Each credential is a unique digital collectible

---

## 📋 Smart Contract Details

| Property | Value |
|----------|-------|
| **Contract Package Hash** | `baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0` |
| **Network** | `casper-test` (Testnet) |
| **Framework** | Odra 2.4.0 (Rust) |
| **Explorer** | [View on CSPR.live](https://testnet.cspr.live/contract-package/baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0) |

### Entry Points

| Function | Description | Gas |
|----------|-------------|-----|
| `issue(holder, credential_type, title, expires_at, metadata_hash)` | Issue new credential | ~15 CSPR |
| `revoke(id, reason)` | Revoke with audit trail | ~3 CSPR |
| `verify(id)` | Get verification result | Read-only |
| `get_credential(id)` | Fetch credential data | Read-only |
| `get_holder_creds(holder)` | List holder's credentials | Read-only |
| `total()` | Total credentials issued | Read-only |

### On-Chain Data Structure
```rust
struct Credential {
    issuer: Address,
    holder: Address,
    cred_type: String,      // degree, certificate, license, employment, identity
    title: String,
    institution: String,
    issued_at: u64,
    expires_at: u64,
    revoked: bool,
    metadata_hash: String,  // IPFS CID for extended metadata
    schema_version: u8,
}
```

---

## 🏗️ Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     Frontend     │────▶│   Casper RPC     │────▶│  Smart Contract  │
│  React + Vite    │     │    (Proxy)       │     │   (Odra/Rust)    │
│  TailwindCSS     │     │                  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                                                 │
         ▼                                                 ▼
┌──────────────────┐                              ┌──────────────────┐
│      IPFS        │                              │   On-Chain       │
│    (Pinata)      │                              │    Storage       │
│  Extended Meta   │                              │  Core Cred Data  │
└──────────────────┘                              └──────────────────┘
```

**On-chain:** issuer, holder, type, title, institution, timestamps, revoked status, IPFS hash  
**Off-chain (IPFS):** Full metadata JSON, images, documents

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Smart Contract** | Rust + [Odra Framework](https://odra.dev) |
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | TailwindCSS |
| **Wallet Integration** | CSPR.click SDK + Casper Wallet Extension |
| **Decentralized Storage** | IPFS via Pinata |
| **OCR** | Tesseract.js (client-side) |
| **Deployment** | Vercel (frontend) + Casper Testnet (contract) |

---

## 🚀 Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
```bash
# frontend/.env
VITE_CONTRACT_HASH=contract-package-baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0
VITE_CASPER_NETWORK=casper-test
VITE_CASPER_RPC=https://node.testnet.casper.network/rpc
VITE_PINATA_API_KEY=xxx        # Optional - for IPFS uploads
VITE_PINATA_SECRET_KEY=xxx     # Optional - for IPFS uploads
```

### Contract Development
```bash
cd contracts
cargo odra build    # Build WASM
cargo odra test     # Run tests
```

---

## 👥 User Roles

### 🏛️ Issuer Portal
- Issue credentials on-chain with wallet signing
- Upload document images (OCR auto-fill)
- Batch issuance via CSV
- View issuance history
- Revoke credentials with reason

### 🔍 Verifier Portal
- Instant blockchain verification
- No wallet required
- View full credential details
- Export verification reports

### 👤 Holder Portal
- View all credentials issued to your address
- Refresh/sync from blockchain
- Share via QR code or link
- Export as PDF certificate
- IPFS metadata display

---

## 🔐 Security Features

- **Ed25519/Secp256k1 Signatures** — Cryptographic proof of issuance
- **Immutable Ledger** — Cannot alter historical records
- **Access Control** — Only issuer can revoke their credentials
- **Decentralized Storage** — IPFS for metadata redundancy

---

## 📝 Credential Types Supported

| Type | Icon | Use Case |
|------|------|----------|
| Degree | 🎓 | University diplomas, academic credentials |
| Certificate | 📜 | Professional certifications, course completions |
| License | 📋 | Professional licenses, occupational permits |
| Employment | 💼 | Work history, job verification |
| Identity | 🪪 | ID documents, KYC verification |

---

## ⚠️ Important Notes

- **Issuing requires Casper Wallet extension** — Social login (CSPR.click) is for viewing only
- **Testnet CSPR needed** — Get free testnet tokens from [faucet](https://testnet.cspr.live/tools/faucet)
- **RPC proxied** — Calls go through `/api/rpc` to avoid CORS
- **Demo mode** — Anyone can issue credentials (no issuer registration required)

---

## 📄 License

MIT

---

## 🔗 Links

- **Live Demo:** https://casper-creds.vercel.app
- **Contract Explorer:** https://testnet.cspr.live/contract-package/baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0
- **Casper Network:** https://casper.network
- **Odra Framework:** https://odra.dev
