const hre = require("hardhat");

async function buildPermit(owner, token, spender, value, deadline) {
    const ownerAddr = await owner.getAddress();
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;
    const nonce = await token.nonces(ownerAddr);

    const domain = {
        name: await token.name(),
        version: "1",
        chainId,
        verifyingContract: await token.getAddress(),
    };

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const values = {
        owner: ownerAddr,
        spender,
        value,
        nonce,
        deadline,
    };

    const signature = await owner.signTypedData(domain, types, values);
    const sig = hre.ethers.Signature.from(signature);
    return { v: sig.v, r: sig.r, s: sig.s };
}

async function main() {
    const factoryAddr = process.env.FACTORY_ADDRESS;
    if (!factoryAddr) throw new Error("FACTORY_ADDRESS is not set.");

    const factory = await hre.ethers.getContractAt("TokenFactory", factoryAddr);
    const tokens = await factory.getAllTokens();
    if (!tokens.length) throw new Error("No tokens created by factory.");

    const tokenAddr = tokens[tokens.length - 1];
    console.log("Using token:", tokenAddr);

    const token = await hre.ethers.getContractAt("CustomToken", tokenAddr);
    const decimals = await token.decimals();
    console.log("decimals:", decimals);

    // Signers: owner authorizes, spender executes transferFrom
    const spenderSigner = new hre.ethers.Wallet(process.env.PRIVATE_KEY);
    if (!spenderSigner) throw new Error("PRIVATE_KEY is not set.");

    const ownerSigner = new hre.ethers.Wallet(process.env.PRIVATE_KEY_1);
    if (!ownerSigner) throw new Error("PRIVATE_KEY_1 is not set.");

    const ownerAddr = await ownerSigner.getAddress();
    const spenderAddr = await spenderSigner.getAddress();

    // Amount config
    const amountRaw = "100";
    const deadlineSec = Number(Math.floor(Date.now() / 1000) + 3600);
    const amount = hre.ethers.parseUnits(amountRaw, decimals);

    // Optional: ensure owner has enough balance to transfer
    const ownerBal = await token.balanceOf(ownerAddr);
    console.log("Owner balance:", hre.ethers.formatUnits(ownerBal, decimals));
    if (ownerBal < amount) {
        console.warn("Warning: Owner balance < amount. TransferFrom may fail.");
    }

    console.log(`Building permit for owner=${ownerAddr}, spender=${spenderAddr}, amount=${amountRaw}`);
    const { v, r, s } = await buildPermit(ownerSigner, token, spenderAddr, amount, deadlineSec);

    console.log("Submitting permit...");
    const tx1 = await token.permit(ownerAddr, spenderAddr, amount, deadlineSec, v, r, s);
    const rc1 = await tx1.wait();
    console.log("permit tx:", rc1.hash);

    // Now spender call transferFrom
    const toAddr = "0xe8a2057af41e0342202cf73bF508Ad4254CBb716";
    console.log(`Calling transferFrom(owner -> ${toAddr}, amount=${amountRaw}) as spender`);
    const spender = spenderSigner;
    const tokenAsSpender = token.connect(spender);
    const tx2 = await tokenAsSpender.transferFrom(ownerAddr, toAddr, amount);
    const rc2 = await tx2.wait();
    console.log("transferFrom tx:", rc2.hash);

    const finalAllowance = await token.allowance(ownerAddr, spenderAddr);
    console.log("Remaining allowance:", hre.ethers.formatUnits(finalAllowance, decimals));
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
