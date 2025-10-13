use ethers::prelude::*;
use std::error::Error;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // -----------------------------
    // 1️⃣  Load environment & provider
    // -----------------------------
    dotenv::dotenv().ok(); // optional: load from .env
    let rpc_url = std::env::var("RPC_URL")
        .unwrap_or_else(|_| "https://sepolia.infura.io/v3/YOUR_KEY".to_string());
    let private_key = std::env::var("PRIVATE_KEY").expect("Missing PRIVATE_KEY env var");

    let provider =
        Provider::<Http>::try_from(rpc_url)?.interval(std::time::Duration::from_millis(10u64));
    let wallet: LocalWallet = private_key
        .parse::<LocalWallet>()?
        .with_chain_id(11155111u64); // Example: Sepolia
    let client = Arc::new(SignerMiddleware::new(provider, wallet));

    // -----------------------------
    // 2️⃣  Compile or load the contract
    // -----------------------------
    // Assuming `artifacts/contracts/TokenFactory.json` exists (from Hardhat build)
    let abi = include_str!("../../../../../artifacts/contracts/Factory.sol/TokenFactory.json");
    let artifact: serde_json::Value = serde_json::from_str(abi)?;
    let contract_abi = serde_json::to_string(&artifact["abi"])?;
    let bytecode = artifact["bytecode"].as_str().unwrap();

    // -----------------------------
    // 3️⃣  Deploy the contract
    // -----------------------------
    let factory = ContractFactory::new(
        serde_json::from_str(&contract_abi)?,
        bytecode.parse::<Bytes>()?,
        client.clone(),
    );

    let deploy_tx = factory.deploy(())?; // No constructor args
    let contract = deploy_tx.send().await?;
    let addr = contract.address();

    println!("✅ TokenFactory deployed at: {:?}", addr);

    Ok(())
}
