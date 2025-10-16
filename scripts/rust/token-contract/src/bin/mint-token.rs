use alloy::{
    primitives::{Address, Bytes, U256},
    providers::{Provider, ProviderBuilder},
    rpc::types::TransactionRequest,
    signers::local::PrivateKeySigner,
    sol_types::sol,
};
use alloy_sol_types::SolCall;
use clap::Parser;
use std::{env, str::FromStr};
use url::Url;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// To Address
    #[arg(short, long)]
    to: Address,

    /// Token amount
    #[arg(short, long)]
    amount: U256,
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

    // Prepare calldata for TokenFactory.mint(address,uint256) using sol!
    sol! {
        function mint(address to, uint256 amount);
    }
    let calldata: Bytes = mintCall {
        to: args.to,
        amount: args.amount,
    }
    .abi_encode()
    .into();

    // Send the mintToken transaction to the deployed factory address
    let tx = TransactionRequest::default()
        .to(contract)
        .input(calldata.clone().into());
    let tx_hash = provider.send_transaction(tx).await?.watch().await?;

    println!("✅ Tx sent: {tx_hash:?}");

    Ok(())
}
