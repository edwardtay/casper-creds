# CasperCreds

Decentralized verifiable credentials on Casper blockchain.

**[Live Demo](https://casper-creds.vercel.app)** · **[Contract](https://testnet.cspr.live/contract-package/baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0)**

## Features

- Issue credentials (degrees, certificates, licenses, employment, identity)
- Verify credentials on-chain with QR codes
- Holder wallet view with credential management
- IPFS metadata storage via Pinata
- OCR document scanning (Tesseract.js)
- PDF export

## Contract

| Network | `casper-test` |
|---------|---------------|
| Package | `baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0` |
| Framework | Odra 2.4.0 |

### Entry Points

```
issue(holder, credential_type, title, expires_at, metadata_hash) -> U256
revoke(id, reason)
verify(id) -> VerificationResult
get_credential(id) -> Option<Credential>
get_holder_creds(holder) -> Vec<U256>
total() -> U256
```

### Events (CES)

- `CredentialIssued { id, issuer, holder, cred_type, timestamp }`
- `CredentialRevoked { id, issuer, reason, timestamp }`
- `IssuerRegistered { issuer, name, timestamp }`

## Stack

**Contract:** Rust, Odra 2.4.0  
**Frontend:** React, TypeScript, Vite, TailwindCSS  
**Wallet:** CSPR.click SDK, Casper Wallet  
**Storage:** IPFS (Pinata)  
**Deploy:** Vercel

## Development

```bash
# Frontend
cd frontend && npm install && npm run dev

# Contract
cd contracts && cargo odra build
```

### Environment

```bash
# frontend/.env
VITE_CONTRACT_HASH=contract-package-baaebc97...
VITE_CASPER_NETWORK=casper-test
VITE_PINATA_API_KEY=xxx
VITE_PINATA_SECRET_KEY=xxx
```

## Notes

- Issuing requires Casper Wallet extension (CSPR.click social login is view-only)
- Gas: ~15 CSPR issue, ~3 CSPR revoke
- Demo mode: anyone can issue without registration
- Odra Mappings require event-based queries (standard dictionary queries don't work)

## License

MIT
