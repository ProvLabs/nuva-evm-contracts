const { ethers } = require("hardhat");

async function main() {
    const DEPOSITOR_CONTRACT_ADDR = process.env.DEPOSITOR_CONTRACT;
    if (!DEPOSITOR_CONTRACT_ADDR) {
        throw new Error("DEPOSITOR_CONTRACT is not set.");
    }

    const DEPOSITOR_FACTORY_CONTRACT_ADDR = process.env.DEPOSITOR_FACTORY_CONTRACT;
    if (!DEPOSITOR_FACTORY_CONTRACT_ADDR) {
        throw new Error("DEPOSITOR_FACTORY_CONTRACT is not set.");
    }

    const depositorFactory = await ethers.getContractAt("DepositorFactory", DEPOSITOR_FACTORY_CONTRACT_ADDR);
    const depositor = await ethers.getContractAt("Depositor", DEPOSITOR_CONTRACT_ADDR);

    const tokenAddr = process.env.TOKEN_ADDRESS;
    if (!tokenAddr) {
        throw new Error("TOKEN_ADDRESS is not set.");
    }

    const shareTokenAddr = process.env.SHARE_TOKEN_ADDRESS;
    if (!shareTokenAddr) {
        throw new Error("SHARE_TOKEN_ADDRESS is not set.");
    }

    const amlSignerAddr = process.env.AML_SIGNER_KEY;
    if (!amlSignerAddr) {
        throw new Error("AML_SIGNER_KEY is not set.");
    }

    // 5. Initialize a new Depositor instance through the factory
    const depositTokenAddress = ethers.getAddress(tokenAddr);
    const shareTokenAddress = ethers.getAddress(shareTokenAddr);
    const amlSignerAddress = ethers.getAddress(amlSignerAddr);

    console.log("depositTokenAddress:", depositTokenAddress);
    console.log("shareTokenAddress:", shareTokenAddress);
    console.log("amlSignerAddress:", amlSignerAddress);
    console.log("Creating new Depositor instance...");

    console.log("Depositor address:", await depositorFactory.depositors(shareTokenAddress, depositTokenAddress));

    console.log("Factory implementation address:", await depositorFactory.implementation());
    const tx = await depositorFactory.createDepositor(shareTokenAddress, depositTokenAddress, amlSignerAddress);
    // Wait for the transaction to be mined
    const receipt = await tx.wait();

    console.log("✅ Transaction successful! Hash:", tx.hash);

    // =================================================================
    // --- START: UPDATED CODE FOR ETHERS V6 ---
    // =================================================================

    let cloneAddress = "";

    // Loop through the raw logs in the receipt
    for (const log of receipt.logs) {
        // We only care about logs from our factory contract
        if (log.address.toLowerCase() !== depositorFactory.target.toLowerCase()) {
            continue;
        }

        // `parseLog` returns the parsed event, or `null` if the log
        // topic doesn't match any event in the factory's ABI
        const parsedLog = depositorFactory.interface.parseLog(log);

        if (parsedLog && parsedLog.name === "DepositorCreated") {
            cloneAddress = parsedLog.args.depositorAddress;

            console.log("-----------------------------------------");
            console.log("🎉 New Depositor Clone Created! 🎉");
            console.log("   Share Token:", parsedLog.args.shareToken);
            console.log("   Deposit Token:", parsedLog.args.depositToken);
            console.log("   Clone Address:", cloneAddress);
            console.log("-----------------------------------------");
            break; // Stop looping once we find it
        }
    }

    if (cloneAddress === "") {
        console.error("Could not find 'DepositorCreated' event in transaction logs.");
    }

    // =================================================================
    // --- END: UPDATED CODE ---
    // =================================================================
}

// Standard Hardhat script runner
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
