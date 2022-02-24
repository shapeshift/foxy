import { ethers, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { Ownable } from "../../typechain-types";
import { Signer } from "ethers";

describe("Ownable", function () {
  let ownable: Ownable;

  beforeEach(async () => {
    const ownableFactory = await ethers.getContractFactory("Ownable");
    ownable = await ownableFactory.deploy();
  });

  it("getOwner returns address that deployed contract", async () => {
    const { admin } = await getNamedAccounts();

    expect(await ownable.getOwner()).eq(admin);
  });
  it("renounceOwner sets owner to 0 address", async () => {
    const { admin } = await getNamedAccounts();
    expect(await ownable.getOwner()).eq(admin);
    await ownable.renounceOwner();
    expect(await ownable.getOwner()).eq(
      "0x0000000000000000000000000000000000000000"
    );
  });
  it("can change owner and protects functions", async () => {
    const { admin, staker1 } = await getNamedAccounts();
    const accounts = await ethers.getSigners();



    await expect(
      ownable.pushOwner("0x0000000000000000000000000000000000000000")
    ).to.be.revertedWith("Ownable: new owner is the zero address");

    await ownable.pushOwner(staker1);
    expect(await ownable.getOwner()).eq(admin);

    const staker1Signer = accounts.find(
      (account) => account.address === staker1
    );
    const ownableStaker1 = ownable.connect(staker1Signer as Signer);

    await expect(ownableStaker1.pushOwner(staker1)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

    await expect(ownable.pullOwner()).to.be.revertedWith(
      "Ownable: must be new owner to pull"
    );


    await ownableStaker1.pullOwner();
    expect(await ownable.getOwner()).eq(staker1);
  });
});
