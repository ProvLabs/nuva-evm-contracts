const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenFactory", function () {
    async function deployFixture() {
        const [deployer, user, spender, receiver] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory("TokenFactory");
        const factory = await Factory.deploy();
        await factory.waitForDeployment();

        const name = "MyToken";
        const symbol = "MTK";
        const initialSupply = 1_000_000n; // human units
        const decimals = 6;

        const tx = await factory.createToken(name, symbol, decimals);
        await tx.wait();

        const addresses = await factory.getAllTokens();
        const tokenAddr = addresses[addresses.length - 1];
        const token = await ethers.getContractAt("CustomToken", tokenAddr);

        const scale = BigInt(10 ** decimals);
        await token.connect(deployer).mint(await deployer.getAddress(), initialSupply * scale);

        return {
            deployer,
            user,
            spender,
            receiver,
            factory,
            token,
            name,
            symbol,
            initialSupply: BigInt(initialSupply),
            decimals,
        };
    }

    it("emits TokenCreated with decimals and stores token", async function () {
        const { factory, name, symbol, decimals } = await deployFixture();

        const filter = factory.filters.TokenCreated();
        const events = await factory.queryFilter(filter, 0);
        const last = events[events.length - 1];
        expect(last.args.name).to.equal(name);
        expect(last.args.symbol).to.equal(symbol);
        expect(last.args.decimals).to.equal(decimals);

        const all = await factory.getAllTokens();
        expect(all.length).to.be.greaterThan(0);
    });

    it("approve and allowances via SafeERC20 helpers on factory", async function () {
        const { deployer, receiver, token, factory, decimals } = await deployFixture();

        const factoryAddr = await factory.getAddress();
        const ownerAddr = await deployer.getAddress();
        const amt = 1000n * BigInt(10 ** decimals);

        await token.connect(deployer).approve(factoryAddr, amt);
        expect(await token.allowance(ownerAddr, factoryAddr)).to.equal(amt);

        await expect(
            factory.safeTransferFromToken(await token.getAddress(), ownerAddr, await receiver.getAddress(), 200n),
        ).to.not.be.reverted;

        await token.connect(deployer).transfer(factoryAddr, 150n);
        await expect(factory.safeTransferToken(await token.getAddress(), await receiver.getAddress(), 100n)).to.not.be
            .reverted;
    });
});
