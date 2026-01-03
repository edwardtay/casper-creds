# CasperCreds

Decentralized verifiable credentials on Casper blockchain. Issue, verify, and manage tamper-proof credentials on-chain.

**[Live Demo](https://casper-creds.vercel.app)** | **[Contract on Testnet](https://testnet.cspr.live/contract-package/baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0)**

---

## Contract

| | |
|---|---|
| Package Hash | `baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0` |
| Contract Hash | `2fa763f5eff0cb1f72df076e28e196ea65d382b606917290fe29138ce63e0a21` |
| Network | `casper-test` |
| Framework | Odra 2.4.0 |

### Entry Points

```
issue(holder: Address, credential_type: String, title: String, expires_at: u64, metadata_hash: String) -> U256
revoke(id: U256, reason: String)
verify(id: U256) -> VerificationResult
get_credential(id: U256) -> Option<Credential>
get_holder_creds(holder: Address) -> Vec<U256>
get_issuer_creds(issuer: Address) -> Vec<U256>
total() -> U256
```

### Storage

Odra uses internal state management. Data is accessed via:
- `__events` dictionary — CES-compliant event log (CredentialIssued, CredentialRevoked, IssuerRegistered)
- `__events_length` — Event count
- `state` URef — Internal Mapping storage (credentials, holder_creds, issuer_creds, issuers)

Standard `queryContractDictionary` doesn't work with Odra Mappings. Query events instead.

### On-Chain Schema

```rust
struct Credential {
    issuer: Address,
    holder: Address,
    cred_type: String,
    title: String,
    institution: String,
    issued_at: u64,
    expires_at: u64,
    revoked: bool,
    metadata_hash: String,  // IPFS CID
    schema_version: u8,
}
```

---

## Architecture

```
Frontend (React/Vite)
    │
    ├── /api/rpc (Vercel serverless) ──► Casper RPC Node
    │
    ├── CSPR.click SDK ──► Wallet signing (Casper Wallet, Ledger, social)
    │
    └── Pinata API ──► IPFS (metadata storage)
```

**On-chain:** Core credential data, events, indexes  
**Off-chain:** Extended metadata JSON, images (IPFS)

### Event-Based Queries

Holder credentials are retrieved by:
1. Query `__events_length` URef for count
2. Query `__events` dictionary by index (0 to length-1)
3. Parse CES byte format: `[name_len: u32][name: bytes][data: bytes]`
4. Filter `CredentialIssued` events by holder address

---

## Stack

- **Contract:** Rust + Odra 2.4.0
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS
- **Wallet:** CSPR.click SDK, Casper Wallet extension
- **Storage:** IPFS (Pinata)
- **OCR:** Tesseract.js (client-side)
- **Deploy:** Vercel

---

## Local Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Contract
cd contracts
cargo odra build
cargo odra test
```

### Environment

```bash
# frontend/.env
VITE_CONTRACT_HASH=contract-package-baaebc97aab58cbc5ef6681663786a210d934e35054bfae615ca5333fbaf94d0
VITE_CASPER_NETWORK=casper-test
VITE_CASPER_RPC=https://node.testnet.casper.network/rpc
VITE_PINATA_API_KEY=xxx
VITE_PINATA_SECRET_KEY=xxx
```

---

## Usage Notes

- **Issuing:** Requires Casper Wallet extension for deploy signing. CSPR.click social login is view-only.
- **Gas:** ~15 CSPR for issue, ~3 CSPR for revoke
- **Demo mode:** Contract allows anyone to issue (no issuer registration required)
- **RPC proxy:** Frontend uses `/api/rpc` serverless function to avoid CORS

---

## License

MIT
