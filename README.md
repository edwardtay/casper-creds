# CasperCreds 🎓

**Verifiable Credentials on Casper Blockchain** — Issue, verify, and manage tamper-proof credentials with AI fraud detection.

[![Casper Network](https://img.shields.io/badge/Casper-Testnet-red)](https://testnet.cspr.live)
[![Contract](https://img.shields.io/badge/Contract-Live-green)](https://testnet.cspr.live/contract-package/fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973)
[![Odra Framework](https://img.shields.io/badge/Odra-v2.4.0-orange)](https://odra.dev)

---

## 🚀 Live Demo

**Contract:** [`fc4506f2...`](https://testnet.cspr.live/contract-package/fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973) on Casper Testnet

### Live Credentials (On-Chain)

| ID | Type | Title | Transaction |
|----|------|-------|-------------|
| 0 | 🎓 Degree | Bachelor of Science in Computer Science | [View TX](https://testnet.cspr.live/transaction/60145ce6a20b058fd7f69060192929fa32ad9519a6b2f64821216ebd1b932127) |
| 1 | 📜 Certificate | Cloud Practitioner Certification | [View TX](https://testnet.cspr.live/transaction/301f4dd7d405fdd91c241e656973cf59cd7508e1b149896f3b4eddd35fd502da) |
| 2 | 📋 License | Professional Software Engineer License | [View TX](https://testnet.cspr.live/transaction/5ea7b2d8ad7c083ee6f416878487ce0a7f8e64c14d04603c940c79e9ac6a9ace) |
| 3 | 💼 Employment | Senior Developer - Employment Verification | [View TX](https://testnet.cspr.live/transaction/d4bff277c19f73c44edd6f24f69e7561c82c9006f1539b130297791960d2474d) |
| 4 | 🪪 Identity | Verified Identity Document | [View TX](https://testnet.cspr.live/transaction/b799f8997e19af0ea3e73a11a99382a26f8c6b8aadd2f9339e859352d4f4ad04) |

---

## 🎯 Problem Statement

Credential fraud costs **$600+ billion globally**:
- 40% of resumes contain falsified credentials
- Manual verification takes days/weeks
- Centralized databases are vulnerable to breaches

---

## ✅ Solution

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Smart Contract** | ✅ Live | Odra framework on Casper testnet |
| **Instant Verification** | ✅ Live | On-chain query via RPC |
| **IPFS Storage** | ✅ Live | Pinata for credential metadata |
| **AI Fraud Detection** | ✅ Live | HuggingFace BART-MNLI |
| **URL Routing** | ✅ Live | `/issuer`, `/verifier`, `/holder` |
| **5 Credential Types** | ✅ Live | Degree, Certificate, License, Employment, Identity |
| **CSPR.click Integration** | ✅ Live | Multi-wallet support + social login |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Vite)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   /issuer   │  │  /verifier  │  │   /holder   │              │
│  │   Portal    │  │   Portal    │  │   Portal    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CASPER TESTNET                                │
│  Contract: fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766...  │
│  • issue() • verify() • revoke() • batch_issue()                │
└─────────────────────────────────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Casper RPC    │ │ HuggingFace   │ │ Pinata IPFS   │
│ Live stats    │ │ BART-MNLI     │ │ Metadata      │
└───────────────┘ └───────────────┘ └───────────────┘
```

---

## 📜 Smart Contract

### Data Structures

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
    metadata_hash: String,  // IPFS CID
    schema_version: u8,
}
```

### Contract API

| Function | Access | Gas |
|----------|--------|-----|
| `register_issuer(addr, name)` | Owner | 50 CSPR |
| `issue(holder, type, title, expires, hash)` | Issuer | 50 CSPR |
| `batch_issue(holders[], ...)` | Issuer | 100 CSPR |
| `revoke(id, reason)` | Issuer | 30 CSPR |
| `verify(id)` | Public | Free |

### Events

```rust
event CredentialIssued { id, issuer, holder, cred_type, timestamp }
event CredentialRevoked { id, issuer, reason, timestamp }
event IssuerRegistered { issuer, name, timestamp }
```

---

## 🤖 AI Fraud Detection

```typescript
// HuggingFace BART-MNLI zero-shot classification
const response = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-mnli', {
  body: JSON.stringify({
    inputs: credentialText,
    parameters: { candidate_labels: ['legitimate', 'suspicious', 'fraudulent'] }
  })
});

// Risk Score: 0-30 (green) | 31-60 (yellow) | 61-100 (red)
```

---

## 🚀 Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Deploy Contract
```bash
cd contracts
cargo odra build
cargo run --bin casper_credentials_cli -- deploy
```

### Issue Credential (CLI)
```bash
cargo run --bin casper_credentials_cli -- scenario issue \
  --holder "account-hash-..." \
  --cred-type "degree" \
  --title "BSc Computer Science" \
  --expires 0 \
  --metadata "QmIPFSHash"
```

---

## 📁 Project Structure

```
casper-credentials/
├── frontend/
│   ├── src/
│   │   ├── App.tsx       # Main app with routing
│   │   └── casper.ts     # Casper SDK + IPFS integration
│   └── .env              # API keys (HuggingFace, Pinata)
├── contracts/
│   ├── src/creds.rs      # Smart contract
│   ├── bin/cli.rs        # Deployment & interaction CLI
│   └── wasm/             # Compiled WASM
└── README.md
```

---

## ✅ Hackathon Checklist

- [x] **Smart Contract** - Deployed to Casper testnet
- [x] **On-Chain Credentials** - 5 real credentials issued
- [x] **IPFS Integration** - Pinata for metadata storage
- [x] **AI Integration** - HuggingFace fraud detection
- [x] **Frontend** - React app with 3 portals
- [x] **URL Routing** - `/issuer`, `/verifier`, `/holder`
- [x] **Live Network Stats** - Real-time block/era/peers
- [x] **Transaction Links** - All TXs link to cspr.live
- [x] **PDF Export** - Credential certificates
- [x] **QR Codes** - Shareable verification links
- [x] **CSPR.click** - Multi-wallet support (Casper Wallet, Ledger, Torus, social login)

---

## 🔗 Links

- **Contract:** [testnet.cspr.live/contract-package/fc4506f2...](https://testnet.cspr.live/contract-package/fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973)
- **Casper Network:** [casper.network](https://casper.network)
- **Odra Framework:** [odra.dev](https://odra.dev)

---

## 📄 License

MIT
