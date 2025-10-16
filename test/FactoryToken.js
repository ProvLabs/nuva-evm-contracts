const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CustomToken & TokenFactory", function () {
  async function deployFixture() {
    const [deployer, user, spender, receiver] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("TokenFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const name = "MyToken";
    const symbol = "MTK";
    const initialSupply = 1_000_000n; // human units
    const decimals = 6;

    const tx = await factory.createToken(name, symbol, initialSupply, decimals);
    const receipt = await tx.wait();

    // Read the created token from state (simpler than parsing logs)
    const addresses = await factory.getAllTokens();
    const tokenAddr = addresses[addresses.length - 1];

    const token = await ethers.getContractAt("CustomToken", tokenAddr);

    return { deployer, user, spender, receiver, factory, token, name, symbol, initialSupply: BigInt(initialSupply), decimals };
  }

  it("emits TokenCreated with decimals and stores token", async function () {
    const { factory, name, symbol, initialSupply, decimals } = await deployFixture();

    // Last event logs
    const filter = factory.filters.TokenCreated();
    const events = await factory.queryFilter(filter, 0);
    const last = events[events.length - 1];
    expect(last.args.name).to.equal(name);
    expect(last.args.symbol).to.equal(symbol);
    expect(last.args.initialSupply).to.equal(initialSupply);
    expect(last.args.decimals).to.equal(decimals);

    const all = await factory.getAllTokens();
    expect(all.length).to.be.greaterThan(0);
  });

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

    await expect(token.connect(user).mint(ownerAddr, amount)).to.be.revertedWith("Only owner");

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

    // transfer some to user for burnFrom test
    await token.connect(deployer).transfer(await user.getAddress(), burnAmt);
    await token.connect(user).approve(ownerAddr, burnAmt);
    await token.connect(deployer).burnFrom(await user.getAddress(), burnAmt);

    expect(await token.balanceOf(await user.getAddress())).to.equal(0);
  });

  it("transfer and transferChecked move balances", async function () {
    const { deployer, user, token, decimals } = await deployFixture();

    const amt = 123n * BigInt(10 ** decimals);
    const userAddr = await user.getAddress();

    await expect(token.connect(deployer).transfer(userAddr, amt))
      .to.emit(token, "Transfer");

    await expect(token.connect(user).transferChecked(await deployer.getAddress(), amt))
      .to.emit(token, "Transfer");
  });

  it("approve and allowances via SafeERC20 helpers on factory", async function () {
    const { deployer, spender, receiver, token, factory, decimals } = await deployFixture();

    // Send some tokens to factory so it can manage its own allowances and transfers
    const factoryAddr = await factory.getAddress();
    const ownerAddr = await deployer.getAddress();
    const amt = 1000n * BigInt(10 ** decimals);
    await token.connect(deployer).transfer(factoryAddr, amt);

    // forceApprove sets allowance owned by the factory to spender
    await expect(factory.forceApproveToken(await token.getAddress(), await spender.getAddress(), amt))
      .to.not.be.reverted;
    expect(await token.allowance(factoryAddr, await spender.getAddress())).to.equal(amt);

    // increase/decrease allowance (still for factory as owner)
    await factory.safeIncreaseAllowance(await token.getAddress(), await spender.getAddress(), 100n);
    expect(await token.allowance(factoryAddr, await spender.getAddress())).to.equal(amt + 100n);

    await factory.safeDecreaseAllowance(await token.getAddress(), await spender.getAddress(), 50n);
    expect(await token.allowance(factoryAddr, await spender.getAddress())).to.equal(amt + 50n);

    // spender pulls from factory using safeTransferFrom helper (factory initiates call)
    // First, spender must be allowed by factory (already true). Pull a portion to receiver.
    await expect(factory.safeTransferFromToken(await token.getAddress(), factoryAddr, await receiver.getAddress(), 200n))
      .to.not.be.reverted;

    // factory can also push using safeTransferToken
    await expect(factory.safeTransferToken(await token.getAddress(), await receiver.getAddress(), 100n))
      .to.not.be.reverted;
  });
});
