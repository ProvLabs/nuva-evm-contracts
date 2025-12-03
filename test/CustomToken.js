const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CustomToken", function () {
    async function deployFixture() {
        const [deployer, user] = await ethers.getSigners();

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
        const MINTER_ROLE = await token.MINTER_ROLE();
        await expect(token.connect(deployer).grantRole(MINTER_ROLE, await deployer.getAddress())).to.emit(
            token,
            "RoleGranted",
        );
        await token.connect(deployer).mint(await deployer.getAddress(), initialSupply * scale);

        return { deployer, user, token, name, symbol, initialSupply: BigInt(initialSupply), decimals };
    }

    it("sets custom decimals and mints initial supply scaled", async function () {
        const { deployer, token, initialSupply, decimals } = await deployFixture();
        expect(await token.decimals()).to.equal(decimals);

        const expected = initialSupply * BigInt(10 ** decimals);
        const bal = await token.balanceOf(await deployer.getAddress());
        expect(bal).to.equal(expected);
    });

    it("owner-only mint works", async function () {
        const { deployer, user, token, decimals } = await deployFixture();
        const ownerAddr = await deployer.getAddress();

        const amount = 1_000n * BigInt(10 ** decimals);

        await expect(token.connect(user).mint(ownerAddr, amount)).to.be.revertedWithCustomError(
            token,
            "AccessControlUnauthorizedAccount",
        );

        const prev = await token.balanceOf(ownerAddr);
        await expect(token.connect(deployer).mint(ownerAddr, amount))
            .to.emit(token, "Transfer")
            .withArgs(ethers.ZeroAddress, ownerAddr, amount);
        const after = await token.balanceOf(ownerAddr);
        expect(after).to.equal(prev + amount);
    });

    describe("Burn Functionality", function () {
        it("should allow token holder to burn their own tokens", async function () {
            const { deployer, token, decimals } = await deployFixture();
            const burnAmount = 100n * BigInt(10 ** decimals);
            const initialBalance = await token.balanceOf(await deployer.getAddress());
            const initialSupply = await token.totalSupply();

            await expect(token.connect(deployer).burn(burnAmount))
                .to.emit(token, "TokensBurned")
                .withArgs(await deployer.getAddress(), burnAmount);

            const finalBalance = await token.balanceOf(await deployer.getAddress());
            const finalSupply = await token.totalSupply();

            expect(finalBalance).to.equal(initialBalance - burnAmount);
            expect(finalSupply).to.equal(initialSupply - burnAmount);
        });

        it("should revert when burning more tokens than balance", async function () {
            const { deployer, token, decimals } = await deployFixture();
            const balance = await token.balanceOf(await deployer.getAddress());
            const burnAmount = balance + 1n;

            await expect(token.connect(deployer).burn(burnAmount))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
                .withArgs(await deployer.getAddress(), balance, burnAmount);
        });

        it("should allow approved spender to burn tokens using burnFrom", async function () {
            const { deployer, user, token, decimals } = await deployFixture();
            const userAddr = await user.getAddress();
            const burnAmount = 50n * BigInt(10 ** decimals);

            // Transfer tokens to user
            await token.connect(deployer).transfer(userAddr, burnAmount);

            // Approve deployer to spend user's tokens
            await token.connect(user).approve(await deployer.getAddress(), burnAmount);

            const initialBalance = await token.balanceOf(userAddr);
            const initialSupply = await token.totalSupply();

            await expect(token.connect(deployer).burnFrom(userAddr, burnAmount))
                .to.emit(token, "TokensBurned")
                .withArgs(userAddr, burnAmount);

            const finalBalance = await token.balanceOf(userAddr);
            const finalSupply = await token.totalSupply();

            expect(finalBalance).to.equal(initialBalance - burnAmount);
            expect(finalSupply).to.equal(initialSupply - burnAmount);
        });

        it("should revert when burning more than allowance with burnFrom", async function () {
            const { deployer, user, token, decimals } = await deployFixture();
            const userAddr = await user.getAddress();
            const transferAmount = 100n * BigInt(10 ** decimals);
            const burnAmount = 150n * BigInt(10 ** decimals);

            await token.connect(deployer).transfer(userAddr, transferAmount);
            await token.connect(user).approve(await deployer.getAddress(), transferAmount);

            await expect(token.connect(deployer).burnFrom(userAddr, burnAmount))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
                .withArgs(await deployer.getAddress(), transferAmount, burnAmount);
        });

        it("should emit Transfer event when burning tokens", async function () {
            const { deployer, token, decimals } = await deployFixture();
            const burnAmount = 10n * BigInt(10 ** decimals);
            const deployerAddr = await deployer.getAddress();

            await expect(token.connect(deployer).burn(burnAmount))
                .to.emit(token, "Transfer")
                .withArgs(deployerAddr, ethers.ZeroAddress, burnAmount);
        });
    });

    it("transfer moves balances", async function () {
        const { deployer, user, token, decimals } = await deployFixture();

        const amt = 123n * BigInt(10 ** decimals);
        const userAddr = await user.getAddress();

        await expect(token.connect(deployer).transfer(userAddr, amt)).to.emit(token, "Transfer");

        await expect(token.connect(user).transfer(await deployer.getAddress(), amt)).to.emit(token, "Transfer");
    });
});
