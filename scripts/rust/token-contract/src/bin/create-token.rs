use alloy::{
    primitives::{Address, Bytes},
    providers::{Provider, ProviderBuilder},
    rpc::types::TransactionRequest,
    signers::local::PrivateKeySigner,
};
use alloy_sol_types::SolCall;
use clap::Parser;
use std::{env, str::FromStr};
use token_contract::TokenFactory::createTokenCall;
use url::Url;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Token name
    #[arg(short, long)]
    name: String,

    /// Token symbol
    #[arg(short, long)]
    symbol: String,

    /// Number of decimals
    #[arg(short, long, default_value_t = 9)]
    decimals: u8,
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    dotenv::dotenv().ok();
    let args = Args::parse();

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

    let calldata: Bytes = createTokenCall {
        _name: args.name.clone(),
        _symbol: args.symbol.clone(),
        _decimals: args.decimals,
    }
    .abi_encode()
    .into();

    // Send the createToken transaction to the deployed factory address
    let tx = TransactionRequest::default()
        .to(contract)
        .input(calldata.clone().into());
    let create_tx_hash = provider.send_transaction(tx).await?.watch().await?;

    println!("✅ Tx sent: {create_tx_hash:?}");

    Ok(())
}
