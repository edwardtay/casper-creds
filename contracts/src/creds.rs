#![cfg_attr(target_arch = "wasm32", no_std)]

use odra::prelude::*;
use odra::casper_types::U256;

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
}

#[odra::odra_error]
pub enum Error {
    NotOwner = 1,
    NotIssuer = 2,
    NotCredIssuer = 3,
    NotFound = 4,
    AlreadyRevoked = 5,
    IssuerExists = 6,
}

#[odra::module]
pub struct CasperCreds {
    owner: Var<Address>,
    issuers: Mapping<Address, (String, bool)>,
    credentials: Mapping<U256, Credential>,
    cred_count: Var<U256>,
    holder_creds: Mapping<Address, Vec<U256>>,
}

#[odra::module]
impl CasperCreds {
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
        self.cred_count.set(U256::zero());
    }

    pub fn register_issuer(&mut self, issuer: Address, name: String) {
        self.only_owner();
        if self.issuers.get(&issuer).is_some() {
            self.env().revert(Error::IssuerExists);
        }
        self.issuers.set(&issuer, (name, true));
    }

    pub fn deactivate_issuer(&mut self, issuer: Address) {
        self.only_owner();
        if let Some((name, _)) = self.issuers.get(&issuer) {
            self.issuers.set(&issuer, (name, false));
        }
    }

    pub fn issue(
        &mut self,
        holder: Address,
        credential_type: String,
        title: String,
        expires_at: u64,
        metadata_hash: String,
    ) -> U256 {
        let caller = self.env().caller();
        let (institution, active) = self.issuers.get(&caller)
            .unwrap_or_else(|| self.env().revert(Error::NotIssuer));
        if !active { self.env().revert(Error::NotIssuer); }

        let id = self.cred_count.get_or_default();
        let cred = Credential {
            issuer: caller,
            holder,
            cred_type: credential_type,
            title,
            institution,
            issued_at: self.env().get_block_time(),
            expires_at,
            revoked: false,
        };

        self.credentials.set(&id, cred);
        self.cred_count.set(id + 1);

        // Index by holder
        let mut list = self.holder_creds.get(&holder).unwrap_or_default();
        list.push(id);
        self.holder_creds.set(&holder, list);

        id
    }

    pub fn revoke(&mut self, id: U256) {
        let caller = self.env().caller();
        let mut cred = self.credentials.get(&id)
            .unwrap_or_else(|| self.env().revert(Error::NotFound));
        if cred.issuer != caller { self.env().revert(Error::NotCredIssuer); }
        if cred.revoked { self.env().revert(Error::AlreadyRevoked); }
        cred.revoked = true;
        self.credentials.set(&id, cred);
    }

    pub fn verify(&self, id: U256) -> (bool, Credential) {
        let cred = self.credentials.get(&id)
            .unwrap_or_else(|| self.env().revert(Error::NotFound));
        let now = self.env().get_block_time();
        let expired = cred.expires_at > 0 && now > cred.expires_at;
        (!cred.revoked && !expired, cred)
    }

    pub fn get_credential(&self, id: U256) -> Option<Credential> {
        self.credentials.get(&id)
    }

    pub fn get_holder_creds(&self, holder: Address) -> Vec<U256> {
        self.holder_creds.get(&holder).unwrap_or_default()
    }

    pub fn get_issuer(&self, addr: Address) -> Option<(String, bool)> {
        self.issuers.get(&addr)
    }

    pub fn total(&self) -> U256 {
        self.cred_count.get_or_default()
    }

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
    fn full_flow() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let uni = env.get_account(1);
        let student = env.get_account(2);

        let mut c = CasperCreds::deploy(&env, NoArgs);
        
        env.set_caller(owner);
        c.register_issuer(uni, "MIT".into());

        env.set_caller(uni);
        let id = c.issue(student, "degree".into(), "BSc CS".into(), 0, "".into());

        let (valid, cred) = c.verify(id);
        assert!(valid);
        assert_eq!(cred.title, "BSc CS");

        c.revoke(id);
        let (valid, _) = c.verify(id);
        assert!(!valid);
    }
}
