const { ethers } = require("hardhat");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_ETH;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
  throw new Error("VAULT_CROSS_CHAIN_PROXY_ETH is not set.");
}
// --- END: Configuration ---

async function main() {
  // Get our "user" (signer 1)
  const [user] = await ethers.getSigners();

  // Get contract instances
  const vault = await ethers.getContractAt(
    "CrossChainVault",
    CROSS_CHAIN_MANAGER_ADDRESS,
  );
  const oldOwner = await vault.owner();

  console.log(`Simulating update as user: ${user.address}`);
  console.log(`Current Owner Address: ${oldOwner}`);

  // connect the `user` to the `vault` contract
  try {
    const acceptTx = await vault.connect(user).acceptOwnership();
    const receipt = await acceptTx.wait();

    console.log("   ✅ Update successful! Transaction hash:", receipt.hash);
    console.log(`Ownership Accepted!`);
  } catch (error) {
    console.log("Actual Revert Reason:", error);
  }

  const newOwner = await vault.owner();
  console.log(`New Owner Address: ${newOwner}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
