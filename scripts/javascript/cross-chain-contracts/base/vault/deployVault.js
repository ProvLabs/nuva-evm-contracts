const { ethers } = require("hardhat");

async function main() {
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

    const executor = "0x96846c31e4f87c0f186a322926c61d4183439f0a";

    console.log("Deploying Vault...");
    const proxy = await upgrades.deployProxy(CrossChainVault, [executor], {
        initializer: "initialize",
        kind: "uups",
    });

    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("----------------------------------------------");
    console.log(`Proxy deployed to: ${proxyAddress}`);
    console.log(`Implementation deployed to: ${implementationAddress}`);
    console.log("----------------------------------------------");
}

// Standard Hardhat script runner
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
