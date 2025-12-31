# CasperCreds 🎓

**Verifiable Credentials for the Real World** — Powered by Casper Blockchain

> Degrees, licenses, certifications, employment records, KYC, memberships — any credential that matters, secured with tamper-proof verification and AI-powered fraud detection.

![Casper Hackathon 2026](https://img.shields.io/badge/Casper-Hackathon%202026-red)
![License](https://img.shields.io/badge/license-MIT-blue)
![Rust](https://img.shields.io/badge/Rust-Odra%20Framework-orange)
![React](https://img.shields.io/badge/React-TypeScript-blue)

---

## 🚨 The Problem

Credential fraud is a **$600+ billion global problem**:

- **40% of resumes** contain falsified or exaggerated credentials
- **Diploma mills** issue fake degrees that look legitimate
- **Manual verification** takes days to weeks and costs $50-200 per check
- **Centralized databases** are vulnerable to hacks and insider manipulation
- **Cross-border verification** is nearly impossible — no global standard exists
- **Paper credentials** are easily forged, lost, or damaged

**Real-world impact:**
- Unqualified doctors practicing medicine
- Fake engineers signing off on building safety
- Fraudulent financial advisors managing retirement funds
- Companies hiring based on fabricated experience

---

## ✅ Our Solution

CasperCreds brings **trust infrastructure** to credentials using blockchain technology:

| Feature | Benefit |
|---------|---------|
| **Instant Verification** | Verify any credential in seconds, not weeks |
| **Immutable Records** | Once issued, credentials cannot be altered or deleted |
| **Cryptographic Proof** | Ed25519/Secp256k1 signatures make forgery impossible |
| **AI Fraud Detection** | Pattern analysis catches anomalies and red flags |
| **Global Accessibility** | Verify from anywhere — no borders, no intermediaries |
| **Privacy Preserving** | Holders control what information to share |
| **Revocation Support** | Issuers can revoke compromised credentials |

---

## 🎯 Supported Credential Types

CasperCreds is **not just for academic degrees** — we support any verifiable credential:

| Category | Examples |
|----------|----------|
| 🎓 **Academic** | Degrees, diplomas, transcripts, certifications |
| � **rProfessional** | AWS/GCP/Azure certs, CPA, PMP, bar admission |
| 📋 **Licenses** | Medical, engineering, real estate, driver's license |
| 💼 **Employment** | Job history, title verification, reference letters |
| 🪪 **Identity** | KYC verification, age verification, background checks |
| 🏛️ **Memberships** | Professional associations, alumni networks, clubs |
| 📚 **Training** | Safety certifications, compliance training, courses |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  • Dashboard with analytics    • QR code generation          │
│  • Credential verification     • PDF export                  │
│  • AI fraud detection          • Multi-language (EN/ES/中文)  │
│  • Batch issuance              • Mobile responsive           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Casper Blockchain                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              CasperCreds Smart Contract              │    │
│  │  • register_issuer()  • issue()  • revoke()         │    │
│  │  • verify()  • get_credential()  • get_holder_creds()│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Storage:                                                    │
│  • Issuers mapping (address → name, active)                 │
│  • Credentials mapping (id → credential data)               │
│  • Holder index (address → credential IDs)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Model

### On-Chain Security
- **Owner-controlled issuer registry** — Only contract owner can register issuers
- **Issuer authentication** — Only registered issuers can issue credentials
- **Issuer-only revocation** — Only the original issuer can revoke their credentials
- **Immutable audit trail** — All actions recorded on-chain

### AI Fraud Detection
- **Elite institution claims** — Flags Harvard/MIT/Stanford claims for extra verification
- **Date anomalies** — Catches future dates and impossible timelines
- **Missing identifiers** — Flags certifications without ID numbers
- **Pattern analysis** — Detects vague or suspicious descriptions
- **Cross-credential comparison** — Identifies inconsistencies between documents

### Cryptographic Guarantees
- **Ed25519/Secp256k1 signatures** — Industry-standard cryptography
- **Hash-based integrity** — Credential metadata hashed on-chain
- **QR code verification** — Instant mobile verification

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Rust toolchain with `wasm32-unknown-unknown` target
- Casper Wallet browser extension

### Frontend
```bash
cd casper-credentials/frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Smart Contract
```bash
cd casper_credentials
cargo odra build
# WASM output: wasm/CasperCreds.wasm
```

### Deploy to Testnet
```bash
# 1. Create .env file
cp .env.example .env
# Edit with your secret key path

# 2. Fund account with testnet CSPR
# Get your address:
cargo run --bin casper_credentials_cli -- whoami
# Request CSPR from faucet: https://testnet.cspr.live/tools/faucet

# 3. Deploy
source .env && cargo run --bin casper_credentials_cli -- deploy
```

---

## 📁 Project Structure

```
casper-credentials/
├── frontend/                 # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx          # Main application (all features)
│   │   └── main.tsx         # Entry point
│   ├── index.html
│   ├── tailwind.config.js
│   └── package.json
│
casper_credentials/           # Odra smart contract
├── src/
│   ├── lib.rs               # Module exports
│   └── creds.rs             # CasperCreds contract
├── bin/
│   └── cli.rs               # Deployment CLI
├── wasm/
│   └── CasperCreds.wasm     # Compiled contract
├── Cargo.toml
└── Odra.toml
```

---

## 🔧 Smart Contract API

### Admin Functions
```rust
// Register a new credential issuer (owner only)
register_issuer(issuer: Address, name: String)

// Deactivate an issuer (owner only)
deactivate_issuer(issuer: Address)
```

### Issuer Functions
```rust
// Issue a new credential (registered issuers only)
issue(
    holder: Address,
    credential_type: String,
    title: String,
    expires_at: u64,
    metadata_hash: String
) -> U256  // Returns credential ID

// Revoke a credential (original issuer only)
revoke(id: U256)
```

### Public Functions
```rust
// Verify a credential (returns validity + data)
verify(id: U256) -> (bool, Credential)

// Get credential by ID
get_credential(id: U256) -> Option<Credential>

// Get all credentials for a holder
get_holder_creds(holder: Address) -> Vec<U256>

// Get issuer info
get_issuer(addr: Address) -> Option<(String, bool)>

// Get total credentials issued
total() -> U256
```

---

## 🎨 Features

### For Credential Holders
- ✅ View all your credentials in one place
- ✅ Share credentials via QR code or link
- ✅ Export credentials as PDF
- ✅ Verify your own credentials

### For Issuers (Universities, Companies, Certifiers)
- ✅ Issue individual credentials
- ✅ Batch issue via CSV upload
- ✅ Use pre-built templates
- ✅ Revoke compromised credentials
- ✅ Track issuance history

### For Verifiers (Employers, Institutions)
- ✅ Instant credential verification
- ✅ AI-powered fraud detection
- ✅ Compare multiple credentials
- ✅ Verification audit trail

---

## 🌐 Internationalization

CasperCreds supports multiple languages:
- 🇺🇸 English
- 🇪🇸 Español
- 🇨🇳 中文

---

## 🛣️ Roadmap

- [x] Core smart contract (Odra framework)
- [x] Frontend with verification flow
- [x] AI fraud detection
- [x] QR code generation
- [x] PDF export
- [x] Multi-language support
- [x] Analytics dashboard
- [x] Batch issuance
- [ ] IPFS metadata storage
- [ ] Mobile app (React Native)
- [ ] Institution API integrations
- [ ] Zero-knowledge proofs for privacy
- [ ] Cross-chain verification (Ethereum, Solana)

---

## 🏆 Hackathon Track

**Casper Hackathon 2026** — Building on Casper Network

This project demonstrates:
- Real-world utility of blockchain technology
- Odra framework for smart contract development
- Integration with Casper wallet ecosystem
- AI-enhanced blockchain applications

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

---

## 📞 Contact

- GitHub: [@edwardtay](https://github.com/edwardtay)
- Project: [casper-creds](https://github.com/edwardtay/casper-creds)

---

**Built with ❤️ for Casper Hackathon 2026**
