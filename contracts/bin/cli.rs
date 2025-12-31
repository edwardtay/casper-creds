//! CLI tool for deploying and interacting with CasperCreds contract

use casper_credentials::CasperCreds;
use odra::host::{HostEnv, NoArgs};
use odra::casper_types::U256;
use odra::prelude::Address;
use odra_cli::{
    deploy::DeployScript,
    scenario::{Args, Error, Scenario, ScenarioMetadata},
    CommandArg, ContractProvider, DeployedContractsContainer, DeployerExt,
    OdraCli,
};
use odra::schema::casper_contract_schema::NamedCLType;

/// Deploys CasperCreds contract
pub struct CasperCredsDeployScript;

impl DeployScript for CasperCredsDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer
    ) -> Result<(), odra_cli::deploy::Error> {
        let _creds = CasperCreds::load_or_deploy(
            &env,
            NoArgs,
            container,
            500_000_000_000 // 500 CSPR gas for deployment
        )?;
        Ok(())
    }
}

/// Scenario to register an issuer
pub struct RegisterIssuerScenario;

impl Scenario for RegisterIssuerScenario {
    fn args(&self) -> Vec<CommandArg> {
        vec![
            CommandArg::new("issuer", "Issuer account hash", NamedCLType::Key),
            CommandArg::new("name", "Institution name", NamedCLType::String),
        ]
    }

    fn run(
        &self,
        env: &HostEnv,
        container: &DeployedContractsContainer,
        args: Args
    ) -> Result<(), Error> {
        let mut contract = container.contract_ref::<CasperCreds>(env)?;
        let issuer = args.get_single::<Address>("issuer")?;
        let name = args.get_single::<String>("name")?;
        
        env.set_gas(50_000_000_000);
        contract.try_register_issuer(issuer, name)?;
        Ok(())
    }
}

impl ScenarioMetadata for RegisterIssuerScenario {
    const NAME: &'static str = "register-issuer";
    const DESCRIPTION: &'static str = "Register a new credential issuer (owner only)";
}

/// Scenario to get total credentials count
pub struct TotalScenario;

impl Scenario for TotalScenario {
    fn args(&self) -> Vec<CommandArg> {
        vec![]
    }

    fn run(
        &self,
        env: &HostEnv,
        container: &DeployedContractsContainer,
        _args: Args
    ) -> Result<(), Error> {
        let contract = container.contract_ref::<CasperCreds>(env)?;
        let total: U256 = contract.total();
        println!("Total credentials issued: {}", total);
        Ok(())
    }
}

impl ScenarioMetadata for TotalScenario {
    const NAME: &'static str = "total";
    const DESCRIPTION: &'static str = "Get total number of credentials issued";
}

pub fn main() {
    OdraCli::new()
        .about("CasperCreds - Decentralized Credential Verification on Casper")
        .deploy(CasperCredsDeployScript)
        .contract::<CasperCreds>()
        .scenario(RegisterIssuerScenario)
        .scenario(TotalScenario)
        .build()
        .run();
}
