# GitHub Issue for make-software/casper-wallet

**Title:** `wallet.sign() returns signature that fails deploy verification on network`

---

## Issue

When using the Casper Wallet browser extension to sign deploys, the `sign()` method returns a signature that is rejected by the Casper network with "Invalid Deploy" error.

## Environment
- Casper Wallet browser extension (latest)
- casper-js-sdk
- Network: casper-test

## Steps to Reproduce
1. Create a deploy using casper-js-sdk
2. Convert to JSON with `DeployUtil.deployToJson(deploy)`
3. Call `wallet.sign(JSON.stringify(deployJson), publicKey)`
4. Wallet popup appears, user approves
5. Receive `signatureHex` in response (128 chars, valid signature format)
6. Attach signature to deploy approvals
7. Submit to network via RPC `account_put_deploy`
8. Network rejects with "Invalid Deploy"

## Observed Behavior
- `sign()` returns `{ cancelled: false, signatureHex: '...', signature: Uint8Array }`
- Signature is 128 hex chars (64 bytes) - correct length
- Adding algorithm prefix (01/02) based on key type gives 130 chars
- Deploy is rejected by network

## Expected Behavior
The signature returned by `sign()` should be valid for the deploy hash, allowing the deploy to be accepted by the network.

## Suspicion
It appears the wallet may be signing the JSON string itself rather than computing and signing the deploy hash. This would produce a valid signature over the wrong data.

## Questions
1. Does `sign()` expect the deploy JSON or something else?
2. Should the wallet return a signed deploy object instead of just a signature?
3. Is there a different method for signing deploys vs arbitrary messages?

## Workaround Attempted
- Tried `signMessage()` with deploy hash hex - same result
- Tried `DeployUtil.setSignature()` - fails with invalid params
- CSPR.click SDK `send()` method would be ideal but `useClickRef()` returns undefined in some cases

Any guidance appreciated.

---

**Submit to:** https://github.com/make-software/casper-wallet/issues/new
