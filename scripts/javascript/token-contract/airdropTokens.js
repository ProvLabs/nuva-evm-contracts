const hre = require("hardhat");

// --- START: Configuration ---

// Let's send ETH to a few of the default Hardhat test accounts.
// We'll use account [0] as the funder, so we'll send to accounts [1], [2], and [3].
const RECIPIENT_ADDRESSES = [
    "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a", // Hardhat Account #1
    "0x69482E00b8Ab0a256E8eF99718CcD8a2C460C3f7", // Hardhat Account #2
];

// The amount of ETH to send to each address (as a string)
const AMOUNT_PER_RECIPIENT_ETH = "100.0";

// --- END: Configuration ---

async function main() {
    // 1. Get the funder account
    // `getSigners()` returns the list of pre-funded accounts from the Hardhat Network.
    const [funder] = await hre.ethers.getSigners();
    console.log(`Using funder account: ${funder.address}`);

    // 2. Convert the ETH amount to Wei
    // `parseEther` converts a string like "100.0" into a BigInt representing Wei.
    const amountInWei = hre.ethers.parseEther(AMOUNT_PER_RECIPIENT_ETH);
    console.log(`Airdropping ${AMOUNT_PER_RECIPIENT_ETH} ETH (${amountInWei.toString()} Wei) to each address.`);

    // 3. Check if the funder has enough ETH
    // We use `hre.ethers.provider.getBalance` for native ETH.
    const funderBalance = await hre.ethers.provider.getBalance(funder.address);
    console.log(`Funder balance: ${hre.ethers.formatEther(funderBalance)} ETH`);

    // Calculate total cost (ignoring gas, since it's minimal on localhost)
    const totalCost = amountInWei * BigInt(RECIPIENT_ADDRESSES.length);
    if (funderBalance < totalCost) {
        console.error("❌ Error: Funder account does not have enough ETH to complete the airdrop.");
        console.error(`  Needed: ${hre.ethers.formatEther(totalCost)} ETH`);
        return; // Stop the script
    }

    // 4. Loop through recipients and send the ETH
    console.log("\nStarting airdrop...");
    for (const address of RECIPIENT_ADDRESSES) {
        console.log(`  Sending to ${address}...`);
        try {
            // Create the transaction object for sending native ETH
            const tx = {
                to: address,
                value: amountInWei,
            };

            // Send the transaction using the funder's wallet
            const txResponse = await funder.sendTransaction(tx);
            await txResponse.wait(); // Wait for the transaction to be mined

            console.log(`    ✅ Success! Tx hash: ${txResponse.hash}`);
        } catch (err) {
            console.error(`    ❌ FAILED to send to ${address}: ${err.message}`);
        }
    }
    console.log("\nAirdrop complete.");

    // 5. Verification (similar to your reference script)
    // Let's check the balances of the recipients *after* the airdrop.
    console.log("\n--- Verification ---");
    for (const address of RECIPIENT_ADDRESSES) {
        // We use `provider.getBalance` for native ETH, not `token.balanceOf`
        const balance = await hre.ethers.provider.getBalance(address);
        console.log(`Balance of ${address}: ${hre.ethers.formatEther(balance)} ETH`);
    }

    const finalFunderBalance = await hre.ethers.provider.getBalance(funder.address);
    console.log(`Funder final balance: ${hre.ethers.formatEther(finalFunderBalance)} ETH`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
