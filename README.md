# CasperCreds 🎓

**Verifiable Credentials on Casper Blockchain** — Issue, verify, and manage tamper-proof credentials.

[![Casper Network](https://img.shields.io/badge/Casper-Testnet-red)](https://testnet.cspr.live)
[![Contract](https://img.shields.io/badge/Contract-Live-green)](https://testnet.cspr.live/contract-package/fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973)

**Live Demo:** [casper-creds.vercel.app](https://casper-creds.vercel.app)

---

## ✅ What's Live

| Feature | Status |
|---------|--------|
| Smart Contract on Casper Testnet | ✅ |
| Issue credentials (wallet signing) | ✅ |
| Verify credentials on-chain | ✅ |
| IPFS metadata storage (Pinata) | ✅ |
| OCR auto-fill from document images | ✅ |
| 5 credential types | ✅ |
| PDF export & QR codes | ✅ |
| CSPR.click wallet integration | ✅ |

---

## 🔗 Contract

**Address:** [`fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973`](https://testnet.cspr.live/contract-package/fc4506f2d996605cbb8d4e06158b8d4320433e2dde4dc766f65115911ac98973)

### Sample Credentials On-Chain

| Type | Title | TX |
|------|-------|-----|
| 🎓 Degree | Bachelor of Science in Computer Science | [View](https://testnet.cspr.live/deploy/60145ce6a20b058fd7f69060192929fa32ad9519a6b2f64821216ebd1b932127) |
| 📜 Certificate | Cloud Practitioner Certification | [View](https://testnet.cspr.live/deploy/301f4dd7d405fdd91c241e656973cf59cd7508e1b149896f3b4eddd35fd502da) |
| 📋 License | Professional Software Engineer License | [View](https://testnet.cspr.live/deploy/5ea7b2d8ad7c083ee6f416878487ce0a7f8e64c14d04603c940c79e9ac6a9ace) |
| 💼 Employment | Senior Developer Verification | [View](https://testnet.cspr.live/deploy/d4bff277c19f73c44edd6f24f69e7561c82c9006f1539b130297791960d2474d) |
| 🪪 Identity | Verified Identity Document | [View](https://testnet.cspr.live/deploy/b799f8997e19af0ea3e73a11a99382a26f8c6b8aadd2f9339e859352d4f4ad04) |

---

## 🚀 Run Locally

```bash
cd frontend
npm install
npm run dev
```

---

## 📁 Structure

```
├── frontend/          # React + Vite app
│   ├── src/App.tsx    # Main app (Issuer/Verifier/Holder portals)
│   └── src/casper.ts  # Casper SDK + IPFS
├── contracts/         # Odra smart contract (Rust)
│   └── src/creds.rs   # Credential contract
└── api/rpc.js         # Vercel serverless proxy
```

---

## 📄 License

MIT
