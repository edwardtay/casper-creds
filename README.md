# CasperCreds 🎓

**Verifiable Credentials for the Real World** — Powered by Casper Blockchain

> Degrees, licenses, certifications, employment records, KYC — any credential that matters, secured with tamper-proof verification and AI-powered fraud detection.

![License](https://img.shields.io/badge/license-MIT-blue)
![Rust](https://img.shields.io/badge/Rust-Odra%20Framework-orange)
![React](https://img.shields.io/badge/React-TypeScript-blue)

---

## 🚨 The Problem

Credential fraud is a **$600+ billion global problem**:

| Issue | Impact |
|-------|--------|
| **40% of resumes** contain falsified credentials | Unqualified hires, safety risks |
| **Manual verification** takes days to weeks | Lost productivity, delayed hiring |
| **Centralized databases** are hackable | Data breaches, record tampering |
| **Paper credentials** are easily forged | Diploma mills, fake certifications |
| **Cross-border verification** is nearly impossible | Global workforce challenges |

**Real consequences:**
- Unqualified doctors practicing medicine
- Fake engineers signing off on building safety
- Fraudulent financial advisors managing retirement funds

---

## ✅ Our Solution

CasperCreds provides **trust infrastructure** for credentials:

| Feature | How It Works |
|---------|--------------|
| **Instant Verification** | Query blockchain in seconds, not weeks |
| **Immutable Records** | Once issued, credentials cannot be altered |
| **AI Fraud Detection** | HuggingFace NLP + heuristic analysis |
| **Cryptographic Proof** | Ed25519/Secp256k1 signatures |
| **Global Accessibility** | Verify from anywhere, no intermediaries |
| **Privacy Control** | Holders decide what to share |

---

## 🎯 Supported Credential Types

| Category | Examples |
|----------|----------|
| 🎓 **Academic** | Degrees, diplomas, transcripts |
| 📜 **Professional** | AWS/GCP certs, CPA, PMP, bar admission |
| 📋 **Licenses** | Medical, engineering, real estate |
| 💼 **Employment** | Job history, title verification |
| 🪪 **Identity** | KYC verification, age verification |
| 🏛️ **Memberships** | Professional associations, alumni |
| � **Trainsing** | Safety certs, compliance training |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                   │
│  • Real-time chain stats    • QR code generation            │
│  • AI fraud detection       • PDF export                    │
│  • LocalStorage persistence • Multi-language (EN/ES/中文)    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Casper Network │  │  HuggingFace    │  │  LocalStorage   │
│  (Blockchain)   │  │  (AI/NLP API)   │  │  (Persistence)  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 🔒 Security

### On-Chain
- Owner-controlled issuer registry
- Issuer-only credential issuance
- Issuer-only revocation
- Immutable audit trail

### AI Fraud Detection
- Elite institution claim flagging
- Date anomaly detection
- Missing identifier checks
- HuggingFace NLP classification

### Cryptographic
- Ed25519/Secp256k1 signatures
- Hash-based integrity
- QR code verification

---

## 🚀 Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Smart Contract
```bash
cd contracts
cargo odra build
# Output: CasperCreds.wasm
```

### Deploy
```bash
# Set up .env with your secret key
source .env
cargo run --bin casper_credentials_cli -- deploy
```

---

## 📁 Project Structure

```
casper-credentials/
├── frontend/                 # React + TypeScript + Vite
│   ├── src/App.tsx          # Main application
│   └── package.json
├── contracts/               # Odra smart contract
│   ├── src/
│   │   ├── lib.rs
│   │   └── creds.rs         # CasperCreds contract
│   ├── bin/cli.rs           # Deployment CLI
│   └── Cargo.toml
└── README.md
```

---

## 🔧 Smart Contract API

```rust
// Admin
register_issuer(issuer: Address, name: String)
deactivate_issuer(issuer: Address)

// Issuer
issue(holder, type, title, expires_at, metadata_hash) -> U256
revoke(id: U256)

// Public
verify(id: U256) -> (bool, Credential)
get_credential(id: U256) -> Option<Credential>
get_holder_creds(holder: Address) -> Vec<U256>
total() -> U256
```

---

## 🌐 APIs Used

| API | Purpose | Cost |
|-----|---------|------|
| Casper RPC | Blockchain queries, chain stats | Free |
| HuggingFace Inference | NLP fraud classification | Free tier |
| LocalStorage | Credential persistence | Free |

---

## 🛣️ Roadmap

- [x] Smart contract (Odra)
- [x] Frontend with verification
- [x] AI fraud detection
- [x] QR codes + PDF export
- [x] Multi-language
- [x] Real chain stats
- [x] LocalStorage persistence
- [ ] IPFS metadata storage
- [ ] Mobile app
- [ ] Zero-knowledge proofs
- [ ] Cross-chain support

---

## 📄 License

MIT

---

## 🔗 Links

- [GitHub](https://github.com/edwardtay/casper-creds)
- [Casper Network](https://casper.network)
