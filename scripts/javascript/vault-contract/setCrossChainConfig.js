const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = process.env.DEPOSITOR_CLONE_ADDRESS;
if (!CLONE_ADDRESS) {
  throw new Error("DEPOSITOR_CLONE_ADDRESS is not set.");
}

const CROSS_CHAIN_VAULT_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_BASE_V0;
if (!CROSS_CHAIN_VAULT_ADDRESS) {
  throw new Error("VAULT_CROSS_CHAIN_PROXY_BASE_V0 is not set.");
}

async function main() {
  // 1. Get our "user" (signer 1)
  const [user] = await ethers.getSigners();

  console.log(`Simulating deposit as user: ${user.address}`);
  console.log(`Cross chain vault address: ${CROSS_CHAIN_VAULT_ADDRESS}`);

  // 2. Get contract instances
  // We need the "Depositor" ABI to talk to the clone
  const depositor = await ethers.getContractAt("Depositor", CLONE_ADDRESS);

  // --- STEP 2: DEPOSIT ---
  // The user calls the deposit function on the clone
  console.log("2. Calling setCrossChainConfig() on the clone contract...");

  // Note: We connect the `user` to the `setCrossChainConfig` contract
  const setCrossChainConfigTx = await depositor
    .connect(user)
    .setCrossChainConfig(CROSS_CHAIN_VAULT_ADDRESS);
  const receipt = await setCrossChainConfigTx.wait();

  console.log(
    "✅ setCrossChainConfig successful! Transaction hash:",
    receipt.hash,
  );

  // 4. Final verification
  const crossChainVaultAddress = await depositor.getCrossChainConfig();
  console.log("-----------------------------------------");
  console.log("🎉 Verification Complete 🎉");
  console.log(`Cross chain vault address: ${crossChainVaultAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
