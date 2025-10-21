use alloy::{primitives::Address, providers::ProviderBuilder, signers::local::PrivateKeySigner};
use std::{env, str::FromStr};
use token_contract::TokenFactory;
use url::Url;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    dotenv::dotenv().ok();

    let contract_str = std::env::var("FACTORY_ADDRESS")?;
    let contract = Address::from_str(&contract_str)?;
    let private_key = std::env::var("PRIVATE_KEY")?;

    // Alloy provider + signer
    let signer: PrivateKeySigner = PrivateKeySigner::from_str(&private_key)?;

    // Set up the WS transport and connect.
    let rpc_url = env::var("RPC_URL")?;
    let provider = ProviderBuilder::new()
        .wallet(signer)
        .connect_http(Url::parse(&rpc_url)?);

    let factory = TokenFactory::new(contract, provider);
    let tokens = factory.getAllTokens().call().await?;
    println!("✅ Tokens: {tokens:?}");

    Ok(())
}
