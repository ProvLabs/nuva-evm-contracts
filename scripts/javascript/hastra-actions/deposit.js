const { ethers } = require("hardhat");

/**
 * @notice Script to perform a multi-hop deposit into the DedicatedVaultRouter.
 */
async function main() {
    // 1. Setup - Use environment variables or defaults
    const ROUTER_ADDRESS = process.env.ROUTER_PROXY_ADDRESS;
    const ASSET_ADDRESS = process.env.ASSET_ADDRESS;

    if (!ROUTER_ADDRESS || !ASSET_ADDRESS) {
        throw new Error("Missing ROUTER_PROXY_ADDRESS or ASSET_ADDRESS environment variables");
    }

    const [user] = await ethers.getSigners();
    const router = await ethers.getContractAt("DedicatedVaultRouter", ROUTER_ADDRESS);
    const assetERC20 = await ethers.getContractAt("ERC20", ASSET_ADDRESS);
    const assetPermit = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol:IERC20Permit",
        ASSET_ADDRESS,
    );

    // 2. Parameters
    const depositAmountStr = process.env.DEPOSIT_AMOUNT || "100";
    const decimals = await assetERC20.decimals();
    const amount = ethers.parseUnits(depositAmountStr, decimals);
    const receiver = process.env.RECEIVER_ADDRESS || user.address;
    const minVaultShares = BigInt(process.env.MIN_VAULT_SHARES || "0");
    const minStakingShares = BigInt(process.env.MIN_STAKING_SHARES || "0");
    const minNuvaShares = BigInt(process.env.MIN_NUVA_SHARES || "0");
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // 3. Balance Check
    const balance = await assetERC20.balanceOf(user.address);
    console.log(`--- Status Check ---`);
    console.log(`User Address:    `, user.address);
    console.log(`User Balance:    `, ethers.formatUnits(balance, decimals));
    console.log(`Requested Amount:`, depositAmountStr);

    if (balance < amount) {
        throw new Error(
            `Insufficient balance! You have ${ethers.formatUnits(balance, decimals)} but requested ${depositAmountStr}`,
        );
    }

    // --- STEP A: GENERATE AML SIGNATURE (Simulating your backend) ---
    const amlSignerKey = process.env.AML_PRIVATE_KEY;
    if (!amlSignerKey) {
        throw new Error("Missing AML_PRIVATE_KEY environment variable");
    }
    const amlWallet = new ethers.Wallet(amlSignerKey, ethers.provider);
    const contractAmlSigner = await router.amlSigner();

    console.log(`\n--- AML Verification ---`);
    console.log(`Contract AML Signer:`, contractAmlSigner);
    console.log(`Script AML Signer:  `, amlWallet.address);

    if (contractAmlSigner.toLowerCase() !== amlWallet.address.toLowerCase()) {
        console.warn("⚠️ WARNING: AML Signer mismatch! Transaction WILL revert.");
    }

    const domain = {
        name: "DedicatedVaultRouter",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: ROUTER_ADDRESS,
    };

    const types = {
        Deposit: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "receiver", type: "address" },
            { name: "minVaultShares", type: "uint256" },
            { name: "minStakingShares", type: "uint256" },
            { name: "minNuvaVaultShares", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const amlValue = {
        sender: user.address,
        amount: amount,
        receiver: receiver,
        minVaultShares: minVaultShares,
        minStakingShares: minStakingShares,
        minNuvaVaultShares: minNuvaShares,
        deadline: deadline,
    };

    const amlSignature = await amlWallet.signTypedData(domain, types, amlValue);
    console.log("✅ AML Signature generated");

    // --- STEP B: GENERATE PERMIT SIGNATURE (The User signs this) ---
    const assetName = await assetERC20.name();
    const nonce = await assetPermit.nonces(user.address);

    const permitDomain = {
        name: assetName,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: ASSET_ADDRESS,
    };

    const permitTypes = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const permitValue = {
        owner: user.address,
        spender: ROUTER_ADDRESS,
        value: amount,
        nonce: nonce,
        deadline: deadline,
    };

    console.log("Requesting User Permit signature...");
    const permitSignature = await user.signTypedData(permitDomain, permitTypes, permitValue);
    const sig = ethers.Signature.from(permitSignature);
    console.log("✅ User Permit signature generated");

    // --- STEP C: EXECUTE TRANSACTION ---
    console.log("\nSending depositWithPermit transaction...");
    try {
        const tx = await router.depositWithPermit(
            amount,
            receiver,
            minVaultShares,
            minStakingShares,
            minNuvaShares,
            amlSignature,
            deadline,
            deadline, // permitDeadline
            sig.v,
            sig.r,
            sig.s,
        );

        const receipt = await tx.wait();
        console.log(`\n🚀 Success! Transaction Hash: ${receipt.hash}`);
    } catch (error) {
        if (error.data) {
            try {
                const decodedError = router.interface.parseError(error.data);
                console.error(`\n❌ Transaction Reverted with: ${decodedError ? decodedError.name : error.data}`);
            } catch (parseError) {
                console.error(`\n❌ Transaction Reverted (Raw Data):`, error.data);
            }
        } else {
            console.error(`\n❌ Error:`, error.message);
        }
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
