const { ethers } = require("hardhat");

async function main() {
    // 1. Setup - Replace with your actual deployed Proxy address
    const ROUTER_ADDRESS = "0x0388B608E12DbDb0f6080dCcB7c1388aE6a767ef";
    const ASSET_ADDRESS = "0xba16f5b2fdf7d5686d55c2917f323fecbfef76e6";

    const [user] = await ethers.getSigners();
    const router = await ethers.getContractAt("DedicatedVaultRouter", ROUTER_ADDRESS);
    const asset = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol:ERC20Permit",
        ASSET_ADDRESS
    );

    // 2. Parameters
    const amount = ethers.parseUnits("100", 6); // USDC usually has 6 decimals
    const receiver = user.address;
    const minVaultShares = 0n;
    const minStakingShares = 0n;
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    console.log(`Preparing deposit for ${user.address}...`);

    // --- STEP A: GENERATE AML SIGNATURE (Simulating your backend) ---
    // In production, your JS/Python backend does this with its private key
    const amlSignerKey = process.env.AML_PRIVATE_KEY;
    const amlWallet = new ethers.Wallet(amlSignerKey, ethers.provider);

    const domain = {
        name: "DedicatedVaultRouter",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: ROUTER_ADDRESS
    };

    const types = {
        Deposit: [
            { name: "sender", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "receiver", type: "address" },
            { name: "minVaultShares", type: "uint256" },
            { name: "minStakingShares", type: "uint256" },
            { name: "minNuvaVaultShares", type: "uint256" }, // NEW
            { name: "deadline", type: "uint256" }
        ]
    };

    const amlValue = {
        sender: user.address,
        amount: amount,
        receiver: receiver,
        minVaultShares: minVaultShares,
        minStakingShares: minStakingShares,
        minNuvaVaultShares: 0n, // NEW
        deadline: deadline
    };

    const amlSignature = await amlWallet.signTypedData(domain, types, amlValue);
    console.log("✅ AML Signature generated");

    // --- STEP B: GENERATE PERMIT SIGNATURE (The User signs this) ---
    const nonce = await asset.nonces(user.address);
    const assetName = await asset.name();

    const permitDomain = {
        name: assetName,
        version: "1", // Note: Some USDC versions use "2"
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: ASSET_ADDRESS
    };

    const permitTypes = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const permitValue = {
        owner: user.address,
        spender: ROUTER_ADDRESS,
        value: amount,
        nonce: nonce,
        deadline: deadline
    };

    const permitSignature = await user.signTypedData(permitDomain, permitTypes, permitValue);
    const sig = ethers.Signature.from(permitSignature);
    console.log("✅ User Permit signature generated");

    // --- STEP C: EXECUTE TRANSACTION ---
    console.log("Sending depositWithPermit transaction...");

    const tx = await router.depositWithPermit(
        amount,
        receiver,
        minVaultShares,
        minStakingShares,
        0n, // NEW: minNuvaVaultShares
        amlSignature,
        deadline,
        deadline, // permitDeadline
        sig.v,
        sig.r,
        sig.s
    );

    const receipt = await tx.wait();
    console.log(`\n🚀 Success! View on Explorer: ${receipt.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
