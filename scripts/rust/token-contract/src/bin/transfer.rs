use alloy::{
    primitives::{Address, Bytes, U256},
    providers::{Provider, ProviderBuilder},
    rpc::types::TransactionRequest,
    signers::local::PrivateKeySigner,
};
use alloy_sol_types::SolCall;
use clap::Parser;
use std::{env, str::FromStr};
use token_contract::CustomToken::transferCall;
use url::Url;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Recipient address
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

    let contract_str = std::env::var("TOKEN_ADDRESS")?;
    let contract = Address::from_str(&contract_str)?;
    let private_key = std::env::var("PRIVATE_KEY")?;

    // Alloy provider + signer
    let signer: PrivateKeySigner = PrivateKeySigner::from_str(&private_key)?;

    // Set up the WS transport and connect.
    let rpc_url = env::var("RPC_URL")?;
    let provider = ProviderBuilder::new()
        .wallet(signer)
        .connect_http(Url::parse(&rpc_url)?);

    // Prepare calldata for ERC20 transfer(address,uint256) using sol!
    let calldata: Bytes = transferCall {
        to: args.to,
        value: args.amount,
    }
    .abi_encode()
    .into();

    // Send the transfer transaction to the token contract address
    let tx = TransactionRequest::default()
        .to(contract)
        .input(calldata.clone().into());
    let tx_hash = provider.send_transaction(tx).await?.watch().await?;

    println!("✅ Tx sent: {tx_hash:?}");

    Ok(())
}
