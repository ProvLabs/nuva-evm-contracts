// scripts/burn.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_ETH;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_ETH is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

// NOTE: Change '18' if your token has different decimals
const AMOUNT_TO_BURN = ethers.parseUnits("1", 4);
// --- END: Configuration ---

async function main() {
    const userPrivateKey = process.env.PRIVATE_KEY;
    if (!userPrivateKey) {
        throw new Error("PRIVATE_KEY is not set.");
    }
    const burner = new ethers.Wallet(userPrivateKey, ethers.provider);

    console.log(`Simulating burn as admin: ${burner.address}`);
    console.log(`Targeting contract: ${CROSS_CHAIN_MANAGER_ADDRESS}`);

    // 2. Get contract instances
    const crossChainManager = await ethers.getContractAt("CrossChainManager", CROSS_CHAIN_MANAGER_ADDRESS);
    const shareToken = await ethers.getContractAt("CustomToken", SHARE_TOKEN_ADDRESS);

    // 3. Check the contract's current balance
    const initialBalance = await shareToken.balanceOf(CROSS_CHAIN_MANAGER_ADDRESS);
    console.log(`Contract's initial balance: ${ethers.formatUnits(initialBalance, 6)} tokens.`);

    console.log("initialBalance", initialBalance);
    console.log("AMOUNT_TO_BURN", AMOUNT_TO_BURN);
    if (initialBalance < AMOUNT_TO_BURN) {
        console.error("❌ Error: Contract does not have enough tokens to burn the specified amount.");
        console.error(`  Amount to Burn: ${ethers.formatUnits(AMOUNT_TO_BURN, 6)}`);
        return;
    }

    // --- BURN ---
    console.log(`\n1. Calling burn() on the clone contract to burn ${ethers.formatUnits(AMOUNT_TO_BURN, 6)} tokens...`);

    // Note: We connect the 'burner' to the 'crossChainManager' contract
    // In burn.js, update the burn transaction part:
    try {
        const mintTransactionHash = "0x12345678912212234235435465675765"; // Replace with a valid hash
        console.log(`Attempting to burn ${ethers.formatUnits(AMOUNT_TO_BURN, 6)} tokens...`);

        console.log("burner.address", burner.address);
        const hasBurnRole = await crossChainManager.hasRole(crossChainManager.BURN_ROLE(), burner.address);
        console.log(`Does ${burner.address} have BURN_ROLE? ${hasBurnRole ? "✅ Yes" : "❌ No"}`);

        const burnTx = await crossChainManager.connect(burner).burn(AMOUNT_TO_BURN, mintTransactionHash);
        const receipt = await burnTx.wait();
        console.log("✅ Burn successful! Transaction hash:", receipt.hash);
    } catch (error) {
        console.error("❌ Burn transaction failed:", error.message);
        if (error.reason) {
            console.error("Revert reason:", error.reason);
        }
        process.exit(1);
    }

    // 4. Final verification
    const finalBalance = await shareToken.balanceOf(CROSS_CHAIN_MANAGER_ADDRESS);
    console.log("-----------------------------------------");
    console.log("🎉 Verification Complete 🎉");
    console.log(`Contract's final balance: ${ethers.formatUnits(finalBalance, 6)} tokens.`);

    const expectedBalance = initialBalance - AMOUNT_TO_BURN;
    console.log(`Expected final balance: ${ethers.formatUnits(expectedBalance, 6)} tokens.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
