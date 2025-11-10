const hre = require("hardhat");

async function main() {
    const amlUtils = await hre.ethers.getContractFactory("AMLUtils");
    const amlUtilsContract = await amlUtils.deploy();
    await amlUtilsContract.waitForDeployment();

    console.log(`✅ AMLUtils deployed at: ${amlUtilsContract.target}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
