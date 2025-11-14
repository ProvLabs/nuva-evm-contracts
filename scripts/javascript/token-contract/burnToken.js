const hre = require("hardhat");

async function main() {
    const tokenAddr = process.env.TOKEN_ADDRESS;
    if (!tokenAddr) {
        throw new Error("TOKEN_ADDRESS is not set.");
    }
    console.log("Using token:", tokenAddr);

    const token = await hre.ethers.getContractAt("CustomToken", tokenAddr);
    const decimals = await token.decimals();
    console.log("decimals:", decimals);

    const amount = hre.ethers.parseUnits("100", decimals);

    // Call burn(amount)
    const tx = await token.burn(amount);
    const receipt = await tx.wait();

    console.log("burn tx:", receipt.hash);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
