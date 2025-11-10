const { ethers } = require("hardhat");

async function main() {
    const amlUtilsAddr = process.env.AML_UTILS_CONTRACT;
    if (!amlUtilsAddr) {
        throw new Error("AML_UTILS_CONTRACT is not set.");
    }

    // 1. Get the contract factory for the Withdrawal
    const withdrawal = await ethers.getContractFactory("Withdrawal", {
        libraries: {
            AMLUtils: amlUtilsAddr,
        },
    });

    // 2. Deploy the implementation contract
    console.log("Deploying Withdrawal implementation...");
    const implementation = await withdrawal.deploy();
    await implementation.waitForDeployment();
    console.log("✅ Withdrawal implementation deployed to:", implementation.target);

    const tokenAddr = process.env.TOKEN_ADDRESS;
    if (!tokenAddr) {
        throw new Error("TOKEN_ADDRESS is not set.");
    }

    const shareTokenAddr = process.env.SHARED_TOKEN_ADDRESS;
    if (!shareTokenAddr) {
        throw new Error("SHARED_TOKEN_ADDRESS is not set.");
    }

    const amlSignerAddr = process.env.AML_SIGNER_KEY;
    if (!amlSignerAddr) {
        throw new Error("AML_SIGNER_KEY is not set.");
    }
    // 3. Initialize the deployed contract
    // Convert all addresses to checksum format
    const withdrawalTokenAddress = ethers.getAddress(tokenAddr);
    const shareTokenAddress = ethers.getAddress(shareTokenAddr);
    const amlSignerAddress = ethers.getAddress(amlSignerAddr);

    console.log("Initializing Withdrawal contract with:", {
        withdrawalTokenAddress,
        shareTokenAddress,
        amlSignerAddress,
    });

    // Get the signer
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    // Initialize with the signer
    const tx = await implementation
        .connect(deployer)
        .initialize(withdrawalTokenAddress, shareTokenAddress, amlSignerAddress);
    console.log("\nTransaction hash:", tx.hash);
    const receipt = await tx.wait();

    // Log all events for debugging
    console.log("\nAll events in receipt:", receipt.events?.map((e) => e.event) || []);

    // Method 1: Try to find by event name
    let event = receipt.logs?.find((log) => {
        try {
            const parsedLog = withdrawal.interface.parseLog(log);
            return parsedLog && parsedLog.name === "WithdrawalInitialized";
        } catch (e) {
            return false;
        }
    });

    // If we found an event, parse it
    if (event) {
        const parsedLog = withdrawal.interface.parseLog(event);

        console.log("✅ Found WithdrawalInitialized event:", {
            event: parsedLog.name,
            args: parsedLog.args,
        });
    } else {
        // Fallback: Try to find any event with the depositor address
        const potentialEvents = receipt.logs
            ?.map((log) => {
                try {
                    return withdrawal.interface.parseLog(log);
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean);

        console.log("All parsed events:", potentialEvents);

        // Look for any event where the first argument is an address (potential depositor address)
        for (const e of potentialEvents) {
            if (e.args.length > 0 && ethers.isAddress(e.args[0])) {
                console.log("ℹ️ Found potential event:", {
                    event: e.name,
                    args: e.args,
                });
                break;
            }
        }
    }
}

// Standard Hardhat script runner
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
