use ethers::contract::ContractFactory;
use ethers::core::types::Bytes;
use ethers::providers::{Http, Provider as EthersProvider};
use ethers::signers::{LocalWallet, Signer};
use ethers::utils::hex;
use serde_json::Value;
use std::str::FromStr;
use std::{error::Error, fs, sync::Arc};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // -----------------------------
    // 1️⃣ Load RPC + Wallet
    // -----------------------------
    dotenv::dotenv().ok();
    let rpc_url = std::env::var("RPC_URL")
        .unwrap_or_else(|_| "https://sepolia.infura.io/v3/YOUR_KEY".to_string());
    let private_key = std::env::var("PRIVATE_KEY").expect("Missing PRIVATE_KEY env var");

    // ethers-rs provider and wallet
    let provider = EthersProvider::<Http>::try_from(rpc_url.clone())?;
    let wallet: LocalWallet = LocalWallet::from_str(&private_key)?.with_chain_id(11155111u64); // sepolia default
    let client = Arc::new(ethers::middleware::SignerMiddleware::new(provider, wallet));

    // -----------------------------
    // 2️⃣ Load compiled artifact
    // -----------------------------
    let artifact_path = "./artifacts/contracts/TokenFactory.sol/TokenFactory.json";
    let artifact: Value = serde_json::from_str(&fs::read_to_string(artifact_path)?)?;

    let abi_json = serde_json::to_string(&artifact["abi"])?;
    let bytecode_hex = artifact["bytecode"]
        .as_str()
        .expect("Missing bytecode in artifact");
    // ethers Bytes expects hex string with or without 0x
    let bytecode: Bytes = if let Some(stripped) = bytecode_hex.strip_prefix("0x") {
        hex::decode(stripped)?.into()
    } else {
        hex::decode(bytecode_hex)?.into()
    };

    // -----------------------------
    // 3️⃣ Deploy contract
    // -----------------------------
    // Build a ContractFactory from ABI + bytecode, deploy with no constructor args
    let abi: ethers::abi::Abi = serde_json::from_str(&abi_json)?;
    let factory = ContractFactory::new(abi, bytecode, client.clone());
    let deployer = factory.deploy(())?; // no constructor args
    let contract = deployer.send().await?; // returns Contract
    let address = contract.address();

    println!("✅ TokenFactory deployed at: {address:?}");

    Ok(())
}
