const { ethers } = require("hardhat");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
}

const CROSS_CHAIN_VAULT_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_BASE;
if (!CROSS_CHAIN_VAULT_ADDRESS) {
    throw new Error("VAULT_CROSS_CHAIN_PROXY_BASE is not set.");
}
// --- END: Configuration ---

// --- Helper: Load AML Signer ---
function getAmlSigner() {
    const amlPrivateKey = process.env.AML_PRIVATE_KEY;
    if (!amlPrivateKey || amlPrivateKey.length !== 66) {
        // 0x + 64 hex chars
        throw new Error(
            "Invalid or missing AML_PRIVATE_KEY in .env file. " +
                "It should be a 66-character hex string (starting with 0x).",
        );
    }
    return new ethers.Wallet(amlPrivateKey, ethers.provider);
}

async function main() {
    // Get our "user" (signer 1)
    const [user] = await ethers.getSigners();

    // Get contract instances
    const crossChainManager = await ethers.getContractAt("CrossChainManager", CROSS_CHAIN_MANAGER_ADDRESS);
    const oldAmlSigner = await crossChainManager.amlSigner();
    const newAmlSigner = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";

    console.log(`Simulating update as user: ${user.address}`);
    console.log(`Current AML Signer Address: ${oldAmlSigner}`);
    console.log(`New AML Signer Address: ${newAmlSigner}`);

    // connect the `user` to the `crossChainManager` contract
    try {
        const updateTx = await crossChainManager.connect(user).updateAmlSigner(newAmlSigner);
        const receipt = await updateTx.wait();

        console.log("   ✅ Update successful! Transaction hash:", receipt.hash);
        console.log(`Updated AML Signer Address: ${newAmlSigner}`);
    } catch (error) {
        console.log("Actual Revert Reason:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
