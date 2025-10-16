use alloy::{
    dyn_abi::DynSolValue,
    hex,
    primitives::Bytes,
    primitives::U256,
    primitives::keccak256,
    providers::{Provider, ProviderBuilder},
    rpc::types::TransactionRequest,
    signers::local::PrivateKeySigner,
};
use serde_json::Value;
use std::{env, fs, str::FromStr};
use url::Url;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    dotenv::dotenv().ok();
    let private_key = std::env::var("PRIVATE_KEY")?;

    // Alloy provider + signer
    let signer: PrivateKeySigner = PrivateKeySigner::from_str(&private_key)?;

    // Set up the WS transport and connect.
    let rpc_url = env::var("RPC_URL")?;
    let provider = ProviderBuilder::new()
        .wallet(signer)
        .connect_http(Url::parse(&rpc_url)?);

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

    // Prepare calldata for TokenFactory.createToken via ABI JSON
    // Build function signature from artifact["abi"] to compute selector
    let abi_items = artifact["abi"].as_array().expect("ABI is not an array");
    let mut fn_sig = None;
    for item in abi_items {
        if item["type"].as_str() == Some("function") && item["name"].as_str() == Some("createToken")
        {
            let inputs = item["inputs"].as_array().expect("inputs not array");
            let types: Vec<String> = inputs
                .iter()
                .map(|i| i["type"].as_str().unwrap_or("").to_string())
                .collect();
            let sig = format!("createToken({})", types.join(","));
            fn_sig = Some(sig);
            break;
        }
    }
    let fn_sig = fn_sig.expect("createToken function not found in ABI");
    let selector = &keccak256(fn_sig.as_bytes())[0..4];

    // Arguments (replace these with CLI/env as needed)
    let name: String = "MyToken".to_string();
    let symbol: String = "MTK".to_string();
    let initial_supply: U256 = U256::from(1_000_000u64); // human units
    let decimals: u8 = 6u8;

    // Encode args using DynSolValue
    let encoded_args = DynSolValue::Tuple(vec![
        DynSolValue::String(name.clone()),
        DynSolValue::String(symbol.clone()),
        DynSolValue::Uint(initial_supply, 256),
        DynSolValue::Uint(U256::from(decimals), 8),
    ])
    .abi_encode();

    // Concatenate selector + encoded args
    let mut data = Vec::with_capacity(4 + encoded_args.len());
    data.extend_from_slice(selector);
    data.extend_from_slice(&encoded_args);
    let calldata: Bytes = Bytes::from(data);

    // Send the createToken transaction to the deployed factory address
    let create_tx = TransactionRequest::default()
        .to(address)
        .input(calldata.clone().into());
    let create_tx_hash = provider.send_transaction(create_tx).await?.watch().await?;

    println!("✅ createToken tx sent: {create_tx_hash:?}");

    Ok(())
}
