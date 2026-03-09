const { ethers } = require("hardhat");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_ETH;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
  throw new Error("VAULT_CROSS_CHAIN_PROXY_ETH is not set.");
}
// --- END: Configuration ---

async function main() {
  // Get contract instances
  const vault = await ethers.getContractAt(
    "CrossChainVault",
    CROSS_CHAIN_MANAGER_ADDRESS,
  );

  const owner = await vault.owner();
  console.log(`Current Owner Address: ${owner}`);

  const pendingOwner = await vault.pendingOwner();
  console.log(`Pending Owner Address: ${pendingOwner}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
