use alloy::hex;
use alloy::primitives::Bytes;
use alloy::providers::{Provider, ProviderBuilder, WsConnect};
use alloy::rpc::types::TransactionRequest;
use alloy::signers::local::PrivateKeySigner;
use serde_json::Value;
use std::env;
use std::str::FromStr;
use std::{error::Error, fs};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // -----------------------------
    // 1️⃣ Load RPC + Wallet
    // -----------------------------
    dotenv::dotenv().ok();
    let private_key = std::env::var("PRIVATE_KEY").expect("Missing PRIVATE_KEY env var");

    // Alloy provider + signer
    let signer: PrivateKeySigner = PrivateKeySigner::from_str(&private_key)?;

    // Set up the WS transport and connect.
    let ws_address = env::var("WEBSOCKET_ENDPOINT")?;
    let ws = WsConnect::new(ws_address);
    let provider = ProviderBuilder::new().wallet(signer).connect_ws(ws).await?;

    // -----------------------------
    // 2️⃣ Load compiled artifact
    // -----------------------------
    let artifact_path = "./artifacts/contracts/Factory.sol/TokenFactory.json";
    let artifact: Value = serde_json::from_str(&fs::read_to_string(artifact_path)?)?;

    let _abi_json = serde_json::to_string(&artifact["abi"])?;
    let bytecode_hex = artifact["bytecode"]
        .as_str()
        .expect("Missing bytecode in artifact")
        .to_string();
    // Decode hex string (with or without 0x) to raw bytes, then into Bytes
    let hex_str = bytecode_hex.strip_prefix("0x").unwrap_or(&bytecode_hex);
    let raw: Vec<u8> = hex::decode(hex_str)?;
    let bytecode = Bytes::from(raw);

    // -----------------------------
    // 3️⃣ Deploy contract
    // -----------------------------
    // For TokenFactory (no constructor), deployment tx is simply the bytecode as input.
    let tx = TransactionRequest::default().input(bytecode.into());

    // Send the transaction and wait for inclusion
    let tx_hash = provider.send_transaction(tx).await?.watch().await?;

    // Fetch receipt to get the deployed contract address
    let receipt = provider
        .get_transaction_receipt(tx_hash)
        .await?
        .expect("transaction receipt not found");
    let address = receipt
        .contract_address
        .expect("no contract address in receipt");

    println!("✅ TokenFactory deployed at: {address:?}");

    Ok(())
}
