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

    await expect(token.connect(user).mint(ownerAddr, amount)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");

    const prev = await token.balanceOf(ownerAddr);
    await expect(token.connect(deployer).mint(ownerAddr, amount)).to.emit(token, "Transfer").withArgs(ethers.ZeroAddress, ownerAddr, amount);
    const after = await token.balanceOf(ownerAddr);
    expect(after).to.equal(prev + amount);
  });

  it("burn and burnFrom reduce balances and totalSupply", async function () {
    const { deployer, user, token, decimals } = await deployFixture();
    const ownerAddr = await deployer.getAddress();

    const burnAmt = 10n * BigInt(10 ** decimals);
    const supplyBefore = await token.totalSupply();
    await token.connect(deployer).burn(burnAmt);
    const supplyAfter = await token.totalSupply();
    expect(supplyAfter).to.equal(supplyBefore - burnAmt);

    await token.connect(deployer).transfer(await user.getAddress(), burnAmt);
    await token.connect(user).approve(ownerAddr, burnAmt);
    await token.connect(deployer).burnFrom(await user.getAddress(), burnAmt);

    expect(await token.balanceOf(await user.getAddress())).to.equal(0);
  });

  it("transfer moves balances", async function () {
    const { deployer, user, token, decimals } = await deployFixture();

    const amt = 123n * BigInt(10 ** decimals);
    const userAddr = await user.getAddress();

    await expect(token.connect(deployer).transfer(userAddr, amt))
      .to.emit(token, "Transfer");

    await expect(token.connect(user).transfer(await deployer.getAddress(), amt))
      .to.emit(token, "Transfer");
  });
});
