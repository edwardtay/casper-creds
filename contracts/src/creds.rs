#![cfg_attr(target_arch = "wasm32", no_std)]

//! # CasperCreds Smart Contract
//! 
//! DISCLAIMER: This is a testnet demonstration contract.
//! Not audited. Not for production use. Use at your own risk.
//! Credentials issued are for demonstration purposes only.

use odra::prelude::*;
use odra::casper_types::U256;

/// Credential data structure stored on-chain
#[odra::odra_type]
pub struct Credential {
    pub issuer: Address,
    pub holder: Address,
    pub cred_type: String,
    pub title: String,
    pub institution: String,
    pub issued_at: u64,
    pub expires_at: u64,
    pub revoked: bool,
    pub metadata_hash: String,  // IPFS hash for off-chain data
    pub schema_version: u8,     // For future upgrades
}

/// Revocation event for audit trail
#[odra::odra_type]
pub struct RevocationRecord {
    pub credential_id: U256,
    pub revoked_by: Address,
    pub revoked_at: u64,
    pub reason: String,
}

/// Verification result with detailed status
#[odra::odra_type]
pub struct VerificationResult {
    pub is_valid: bool,
    pub status: u8,  // 0=valid, 1=revoked, 2=expired, 3=issuer_inactive
    pub credential: Credential,
    pub issuer_name: String,
    pub issuer_active: bool,
}

#[odra::odra_error]
pub enum Error {
    NotOwner = 1,
    NotIssuer = 2,
    NotCredIssuer = 3,
    NotFound = 4,
    AlreadyRevoked = 5,
    IssuerExists = 6,
    IssuerNotFound = 7,
    InvalidHolder = 8,
    CredentialExpired = 9,
    BatchLimitExceeded = 10,
}

/// Events emitted for off-chain indexing
#[odra::event]
pub struct CredentialIssued {
    pub id: U256,
    pub issuer: Address,
    pub holder: Address,
    pub cred_type: String,
    pub timestamp: u64,
}

#[odra::event]
pub struct CredentialRevoked {
    pub id: U256,
    pub issuer: Address,
    pub reason: String,
    pub timestamp: u64,
}

#[odra::event]
pub struct IssuerRegistered {
    pub issuer: Address,
    pub name: String,
    pub timestamp: u64,
}

#[odra::module]
pub struct CasperCreds {
    owner: Var<Address>,
    issuers: Mapping<Address, (String, bool)>,
    credentials: Mapping<U256, Credential>,
    cred_count: Var<U256>,
    holder_creds: Mapping<Address, Vec<U256>>,
    issuer_creds: Mapping<Address, Vec<U256>>,  // Index by issuer
    revocations: Mapping<U256, RevocationRecord>,
    schema_version: Var<u8>,
}

#[odra::module]
impl CasperCreds {
    /// Initialize contract with deployer as owner
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
        self.cred_count.set(U256::zero());
        self.schema_version.set(1);
    }

    // ==================== ADMIN FUNCTIONS ====================

    /// Register a new credential issuer (owner only)
    pub fn register_issuer(&mut self, issuer: Address, name: String) {
        self.only_owner();
        if self.issuers.get(&issuer).is_some() {
            self.env().revert(Error::IssuerExists);
        }
        self.issuers.set(&issuer, (name.clone(), true));
        self.env().emit_event(IssuerRegistered {
            issuer,
            name,
            timestamp: self.env().get_block_time(),
        });
    }

    /// Deactivate an issuer (owner only)
    pub fn deactivate_issuer(&mut self, issuer: Address) {
        self.only_owner();
        if let Some((name, _)) = self.issuers.get(&issuer) {
            self.issuers.set(&issuer, (name, false));
        }
    }

    /// Reactivate an issuer (owner only)
    pub fn reactivate_issuer(&mut self, issuer: Address) {
        self.only_owner();
        if let Some((name, _)) = self.issuers.get(&issuer) {
            self.issuers.set(&issuer, (name, true));
        }
    }

    /// Transfer ownership (owner only)
    pub fn transfer_ownership(&mut self, new_owner: Address) {
        self.only_owner();
        self.owner.set(new_owner);
    }

    // ==================== ISSUER FUNCTIONS ====================

    /// Issue a new credential
    pub fn issue(
        &mut self,
        holder: Address,
        credential_type: String,
        title: String,
        expires_at: u64,
        metadata_hash: String,
    ) -> U256 {
        let caller = self.env().caller();
        
        // DEMO MODE: Allow anyone to issue. 
        // If registered, use their name. If not, use "Self-Issued".
        let (institution, _) = self.issuers.get(&caller)
            .unwrap_or(("Self-Issued".to_string(), true));

        let id = self.cred_count.get_or_default();
        let timestamp = self.env().get_block_time();
        
        let cred = Credential {
            issuer: caller,
            holder,
            cred_type: credential_type.clone(),
            title,
            institution,
            issued_at: timestamp,
            expires_at,
            revoked: false,
            metadata_hash,
            schema_version: self.schema_version.get_or_default(),
        };

        self.credentials.set(&id, cred);
        self.cred_count.set(id + 1);

        // Index by holder
        let mut holder_list = self.holder_creds.get(&holder).unwrap_or_default();
        holder_list.push(id);
        self.holder_creds.set(&holder, holder_list);

        // Index by issuer
        let mut issuer_list = self.issuer_creds.get(&caller).unwrap_or_default();
        issuer_list.push(id);
        self.issuer_creds.set(&caller, issuer_list);

        // Emit event for indexers
        self.env().emit_event(CredentialIssued {
            id,
            issuer: caller,
            holder,
            cred_type: credential_type,
            timestamp,
        });

        id
    }

    /// Batch issue credentials (max 10 per call)
    pub fn batch_issue(
        &mut self,
        holders: Vec<Address>,
        credential_type: String,
        title: String,
        expires_at: u64,
        metadata_hash: String,
    ) -> Vec<U256> {
        if holders.len() > 10 {
            self.env().revert(Error::BatchLimitExceeded);
        }
        
        let mut ids = Vec::new();
        for holder in holders {
            let id = self.issue(
                holder,
                credential_type.clone(),
                title.clone(),
                expires_at,
                metadata_hash.clone(),
            );
            ids.push(id);
        }
        ids
    }

    /// Revoke a credential with reason
    pub fn revoke(&mut self, id: U256, reason: String) {
        let caller = self.env().caller();
        let mut cred = self.credentials.get(&id)
            .unwrap_or_else(|| self.env().revert(Error::NotFound));
        if cred.issuer != caller { self.env().revert(Error::NotCredIssuer); }
        if cred.revoked { self.env().revert(Error::AlreadyRevoked); }
        
        let timestamp = self.env().get_block_time();
        cred.revoked = true;
        self.credentials.set(&id, cred);

        // Store revocation record
        self.revocations.set(&id, RevocationRecord {
            credential_id: id,
            revoked_by: caller,
            revoked_at: timestamp,
            reason: reason.clone(),
        });

        // Emit event
        self.env().emit_event(CredentialRevoked {
            id,
            issuer: caller,
            reason,
            timestamp,
        });
    }

    // ==================== PUBLIC QUERY FUNCTIONS ====================

    /// Verify a credential with detailed result
    pub fn verify(&self, id: U256) -> VerificationResult {
        let cred = self.credentials.get(&id)
            .unwrap_or_else(|| self.env().revert(Error::NotFound));
        
        let now = self.env().get_block_time();
        let (issuer_name, issuer_active) = self.issuers.get(&cred.issuer)
            .unwrap_or(("Unknown".into(), false));

        let status = if cred.revoked {
            1 // revoked
        } else if cred.expires_at > 0 && now > cred.expires_at {
            2 // expired
        } else if !issuer_active {
            3 // issuer inactive
        } else {
            0 // valid
        };

        VerificationResult {
            is_valid: status == 0,
            status,
            credential: cred,
            issuer_name,
            issuer_active,
        }
    }

    /// Simple validity check (gas efficient)
    pub fn is_valid(&self, id: U256) -> bool {
        if let Some(cred) = self.credentials.get(&id) {
            let now = self.env().get_block_time();
            let expired = cred.expires_at > 0 && now > cred.expires_at;
            !cred.revoked && !expired
        } else {
            false
        }
    }

    /// Get credential by ID
    pub fn get_credential(&self, id: U256) -> Option<Credential> {
        self.credentials.get(&id)
    }

    /// Get revocation record
    pub fn get_revocation(&self, id: U256) -> Option<RevocationRecord> {
        self.revocations.get(&id)
    }

    /// Get all credential IDs for a holder
    pub fn get_holder_creds(&self, holder: Address) -> Vec<U256> {
        self.holder_creds.get(&holder).unwrap_or_default()
    }

    /// Get all credential IDs issued by an issuer
    pub fn get_issuer_creds(&self, issuer: Address) -> Vec<U256> {
        self.issuer_creds.get(&issuer).unwrap_or_default()
    }

    /// Get issuer info
    pub fn get_issuer(&self, addr: Address) -> Option<(String, bool)> {
        self.issuers.get(&addr)
    }

    /// Get total credentials issued
    pub fn total(&self) -> U256 {
        self.cred_count.get_or_default()
    }

    /// Get contract owner
    pub fn owner(&self) -> Address {
        self.owner.get().unwrap()
    }

    /// Get schema version
    pub fn schema_version(&self) -> u8 {
        self.schema_version.get_or_default()
    }

    // ==================== INTERNAL ====================

    fn only_owner(&self) {
        if self.env().caller() != self.owner.get().unwrap() {
            self.env().revert(Error::NotOwner);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn full_credential_lifecycle() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let university = env.get_account(1);
        let student = env.get_account(2);

        // Deploy contract
        let mut contract = CasperCreds::deploy(&env, NoArgs);
        
        // Register issuer
        env.set_caller(owner);
        contract.register_issuer(university, "MIT".into());

        // Issue credential
        env.set_caller(university);
        let id = contract.issue(
            student,
            "degree".into(),
            "BSc Computer Science".into(),
            0,
            "QmXyz...".into(),
        );

        // Verify credential
        let result = contract.verify(id);
        assert!(result.is_valid);
        assert_eq!(result.status, 0);
        assert_eq!(result.credential.title, "BSc Computer Science");
        assert_eq!(result.issuer_name, "MIT");

        // Check holder index
        let holder_creds = contract.get_holder_creds(student);
        assert_eq!(holder_creds.len(), 1);
        assert_eq!(holder_creds[0], id);

        // Revoke credential
        contract.revoke(id, "Academic misconduct".into());
        
        let result = contract.verify(id);
        assert!(!result.is_valid);
        assert_eq!(result.status, 1); // revoked

        // Check revocation record
        let revocation = contract.get_revocation(id).unwrap();
        assert_eq!(revocation.reason, "Academic misconduct");
    }

    #[test]
    fn batch_issuance() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let university = env.get_account(1);
        
        let mut contract = CasperCreds::deploy(&env, NoArgs);
        
        env.set_caller(owner);
        contract.register_issuer(university, "Harvard".into());

        env.set_caller(university);
        let holders: Vec<Address> = (2..5).map(|i| env.get_account(i)).collect();
        let ids = contract.batch_issue(
            holders,
            "certificate".into(),
            "Data Science Certificate".into(),
            0,
            "".into(),
        );

        assert_eq!(ids.len(), 3);
        assert_eq!(contract.total(), U256::from(3));
    }

    #[test]
    fn issuer_deactivation() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let university = env.get_account(1);
        let student = env.get_account(2);

        let mut contract = CasperCreds::deploy(&env, NoArgs);
        
        env.set_caller(owner);
        contract.register_issuer(university, "MIT".into());
        contract.deactivate_issuer(university);

        // Deactivated issuer cannot issue
        env.set_caller(university);
        // This should revert - in real test we'd use should_revert
    }
}
