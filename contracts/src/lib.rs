#![cfg_attr(target_arch = "wasm32", no_std)]

pub mod creds;
pub use creds::CasperCreds;
