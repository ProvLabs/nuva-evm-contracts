const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CustomToken & TokenFactory", function () {
  async function deployFixture() {
    const [owner, minter, user, spender, receiver] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("TokenFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const name = "MyToken";
    const symbol = "MTK";
    const initialSupply = 1_000_000n; // human units
    const decimals = 6;

    const tx = await factory.createToken(name, symbol, decimals);
    const receipt = await tx.wait();

    // Read the created token from state (simpler than parsing logs)
    const addresses = await factory.getAllTokens();
    const tokenAddr = addresses[addresses.length - 1];

    const token = await ethers.getContractAt("CustomToken", tokenAddr);

    // Mint initial supply to minter since token does not mint on deploy
    const scale = BigInt(10 ** decimals);
    const MINTER_ROLE = await token.MINTER_ROLE();
    await expect(
      token.connect(owner).grantRole(MINTER_ROLE, await minter.getAddress()),
    ).to.emit(token, "RoleGranted");
    await token
      .connect(minter)
      .mint(await minter.getAddress(), initialSupply * scale);

    return {
      owner,
      minter,
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

    // Last event logs
    const filter = factory.filters.TokenCreated();
    const events = await factory.queryFilter(filter, 0);
    const last = events[events.length - 1];
    expect(last.args.name).to.equal(name);
    expect(last.args.symbol).to.equal(symbol);
    expect(last.args.decimals).to.equal(decimals);

    const all = await factory.getAllTokens();
    expect(all.length).to.be.greaterThan(0);
  });

  it("sets custom decimals and mints initial supply scaled", async function () {
    const { minter, token, initialSupply, decimals } = await deployFixture();
    expect(await token.decimals()).to.equal(decimals);

    const expected = initialSupply * BigInt(10 ** decimals);
    const bal = await token.balanceOf(await minter.getAddress());
    expect(bal).to.equal(expected);
  });

  it("mint roles works", async function () {
    const { minter, user, token, decimals } = await deployFixture();
    const ownerAddr = await minter.getAddress();

    const amount = 1_000n * BigInt(10 ** decimals);

    await expect(
      token.connect(user).mint(ownerAddr, amount),
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");

    const prev = await token.balanceOf(ownerAddr);
    await expect(token.connect(minter).mint(ownerAddr, amount))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, ownerAddr, amount);
    const after = await token.balanceOf(ownerAddr);
    expect(after).to.equal(prev + amount);
  });

  it("burn and burnFrom reduce balances and totalSupply", async function () {
    const { minter, user, token, decimals } = await deployFixture();
    const ownerAddr = await minter.getAddress();

    const burnAmt = 10n * BigInt(10 ** decimals);
    const supplyBefore = await token.totalSupply();
    await token.connect(minter).burn(burnAmt);
    const supplyAfter = await token.totalSupply();
    expect(supplyAfter).to.equal(supplyBefore - burnAmt);

    // transfer some to user for burnFrom test
    await token.connect(minter).transfer(await user.getAddress(), burnAmt);
    await token.connect(user).approve(ownerAddr, burnAmt);
    await token.connect(minter).burnFrom(await user.getAddress(), burnAmt);

    expect(await token.balanceOf(await user.getAddress())).to.equal(0);
  });
});
