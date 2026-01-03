# Casper Wallet & SDK Interaction Rules

1. **Signature Format**: Casper Wallet extension may return raw signatures (Uint8Array) or hex strings WITHOUT the algorithm tag. Always check length:
   - If 128 chars (64 bytes), prepend `01` (Ed25519) or `02` (Secp256k1) based on public key.
   - Standard Casper Node expects 130 hex chars (1 byte tag + 64 bytes signature).

2. **Deploy Serialization**: The SDK strict validation often fails with wallet-signed objects or partial JSON.
   - Construct plain object `approvals: [{ signer: ..., signature: ... }]`.
   - Submit via direct JSON-RPC if SDK `putDeploy` fails.

3. **Contract vs Package**:
   - `StoredContractByHash` -> Direct executable (starts with `hash-`).
   - `StoredVersionedContractByHash` -> Contract Package (starts with `contract-package-`).
   - Calling a Package as a Contract results in `no such contract`.
   - Always verify the hash type and use `newStoredVersionContractByHash` for packages.

4. **Browser Compatibility**: Do NOT use `Buffer`. Use `Uint8Array` and custom hex helpers.
