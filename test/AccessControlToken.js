const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CustomToken AccessControl", function () {
  async function deploy() {
    const [admin, alice, bob] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("TokenFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const name = "RoleToken";
    const symbol = "RLT";
    const initialSupply = 1_000_000n; // human units
    const decimals = 6;

    const tx = await factory.createToken(name, symbol, decimals);
    await tx.wait();

    const addresses = await factory.getAllTokens();
    const tokenAddr = addresses[addresses.length - 1];
    const token = await ethers.getContractAt("CustomToken", tokenAddr);

    // Mint initial balance to admin since the contract does not mint on deploy
    const scale = BigInt(10 ** decimals);
    await token.connect(admin).mint(await admin.getAddress(), initialSupply * scale);

    return { admin, alice, bob, factory, token, name, symbol, initialSupply: BigInt(initialSupply), decimals };
  }

  it("assigns DEFAULT_ADMIN, MINTER to creator", async function () {
    const { admin, token } = await deploy();
    const ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const MINTER_ROLE = await token.MINTER_ROLE();

    expect(await token.hasRole(ADMIN_ROLE, await admin.getAddress())).to.equal(true);
    expect(await token.hasRole(MINTER_ROLE, await admin.getAddress())).to.equal(true);
  });

  it("mint requires MINTER_ROLE and is transferrable via grant/revoke", async function () {
    const { admin, alice, token, decimals } = await deploy();
    const MINTER_ROLE = await token.MINTER_ROLE();

    const amount = 1000n * BigInt(10 ** decimals);

    await expect(token.connect(alice).mint(await alice.getAddress(), amount)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );

    await expect(token.connect(admin).grantRole(MINTER_ROLE, await alice.getAddress()))
      .to.emit(token, "RoleGranted");

    await expect(token.connect(alice).mint(await alice.getAddress(), amount))
      .to.emit(token, "Transfer");

    await expect(token.connect(admin).revokeRole(MINTER_ROLE, await alice.getAddress()))
      .to.emit(token, "RoleRevoked");

    await expect(token.connect(alice).mint(await alice.getAddress(), amount)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("should allow token holders to burn their own tokens", async function () {
    const { token, admin, alice } = await deploy();
    
    // Mint some tokens to alice first
    const mintAmount = 1000n * 10n ** 18n;
    await token.connect(admin).mint(await alice.getAddress(), mintAmount);
    
    // Verify alice can burn their own tokens
    const burnAmount = 100n * 10n ** 18n;
    await expect(token.connect(alice).burn(burnAmount))
      .to.emit(token, "TokensBurned")
      .withArgs(await alice.getAddress(), burnAmount);
    
    // Verify balance was reduced
    const balance = await token.balanceOf(await alice.getAddress());
    expect(balance).to.equal(mintAmount - burnAmount);
  });
});
