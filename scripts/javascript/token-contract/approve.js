const hre = require("hardhat");

async function main() {
    const tokenAddr = process.env.TOKEN_ADDRESS;
    if (!tokenAddr) {
        throw new Error("TOKEN_ADDRESS is not set.");
    }
    console.log("Using token:", tokenAddr);

    const spender = process.env.PUBLIC_KEY;
    if (!spender) {
        throw new Error("PUBLIC_KEY is not set.");
    }
    console.log("Using spender:", spender);

    const token = await hre.ethers.getContractAt("CustomToken", tokenAddr);

    const amount = hre.ethers.parseUnits("100", 6);

    // Call approve(amount)
    const tx = await token.approve(spender, amount);
    const receipt = await tx.wait();

    console.log("approve tx:", receipt.hash);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
