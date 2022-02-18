import { ethers, deployments, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, Signer } from "ethers";
import { Foxy, LiquidityReserve, Staking } from "../../typechain-types";
import ERC20 from "@openzeppelin/contracts/build/contracts/ERC20.json";
import { INITIAL_LR_BALANCE, INSTANT_UNSTAKE_FEE } from "../constants";

describe("Liquidity Reserve", function () {
  let accounts: SignerWithAddress[];
  let liquidityReserve: LiquidityReserve;
  let stakingToken: Contract;
  let stakingContract: Staking;
  let rewardToken: Contract;

  const STAKING_TOKEN_WHALE = "0xF152a54068c8eDDF5D537770985cA8c06ad78aBB"; // FOX Whale
  const STAKING_TOKEN = "0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d"; // FOX Address

  beforeEach(async () => {
    const { admin } = await getNamedAccounts();

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MAINNET_URL,
            blockNumber: 14101169,
          },
        },
      ],
    });

    await deployments.fixture();
    accounts = await ethers.getSigners();

    const foxyDeployment = await deployments.get("Foxy");
    rewardToken = new ethers.Contract(
      foxyDeployment.address,
      foxyDeployment.abi,
      accounts[0]
    ) as Foxy;

    const stakingDeployment = await deployments.get("Staking");
    stakingContract = new ethers.Contract(
      stakingDeployment.address,
      stakingDeployment.abi,
      accounts[0]
    ) as Staking;

    const liquidityReserveDeployment = await deployments.get(
      "LiquidityReserve"
    );
    liquidityReserve = new ethers.Contract(
      liquidityReserveDeployment.address,
      liquidityReserveDeployment.abi,
      accounts[0]
    ) as LiquidityReserve;

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [STAKING_TOKEN_WHALE],
    });

    stakingToken = new ethers.Contract(STAKING_TOKEN, ERC20.abi, accounts[0]);

    const transferAmount = BigNumber.from("9000000000000000");
    const whaleSigner = await ethers.getSigner(STAKING_TOKEN_WHALE);
    const stakingTokenWhale = stakingToken.connect(whaleSigner);
    await stakingTokenWhale.transfer(admin, transferAmount);
    const stakingTokenBalance = await stakingToken.balanceOf(admin);

    expect(BigNumber.from(stakingTokenBalance).toNumber()).gte(
      transferAmount.toNumber()
    );

    await liquidityReserve.setFee(INSTANT_UNSTAKE_FEE);
    await rewardToken.initialize(stakingContract.address);

    await stakingToken.approve(liquidityReserve.address, INITIAL_LR_BALANCE); // approve initial liquidity amount
    await liquidityReserve.initialize(
      stakingContract.address,
      foxyDeployment.address
    ); // initialize liquidity reserve contract
  });

  describe("deposit & withdraw", function () {
    it("Should calculate the correct value of lrFOX with multiple providers", async () => {
      const { daoTreasury, staker1, liquidityProvider1 } =
        await getNamedAccounts();

      const transferAmount = BigNumber.from("100000000000000");
      const stakingAmount = transferAmount.div(4);

      await stakingToken.transfer(daoTreasury, transferAmount);
      await stakingToken.transfer(liquidityProvider1, stakingAmount);

      // add liquidity with daoTreasury
      let daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(transferAmount);

      let daoLiquidityReserveBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      expect(daoLiquidityReserveBalance).eq(0);

      const daoTreasurySigner = accounts.find(
        (account) => account.address === daoTreasury
      );
      const liquidityReserveDao = liquidityReserve.connect(
        daoTreasurySigner as Signer
      );
      const stakingTokenDao = stakingToken.connect(daoTreasurySigner as Signer);

      await stakingTokenDao.approve(liquidityReserve.address, transferAmount);
      await liquidityReserveDao.addLiquidity(transferAmount);

      daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(0);

      daoLiquidityReserveBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      expect(daoLiquidityReserveBalance).eq(transferAmount);

      // add liquidity with liquidityProvider1
      const liquidityProvider1Signer = accounts.find(
        (account) => account.address === liquidityProvider1
      );
      const liquidityReserveLiquidityProvider = liquidityReserve.connect(
        liquidityProvider1Signer as Signer
      );
      const stakingTokenLiquidityProvider = stakingToken.connect(
        liquidityProvider1Signer as Signer
      );

      await stakingTokenLiquidityProvider.approve(
        liquidityReserve.address,
        stakingAmount
      );
      await liquidityReserveLiquidityProvider.addLiquidity(stakingAmount);

      let lp1StakingBalance = await stakingToken.balanceOf(liquidityProvider1);
      expect(lp1StakingBalance).eq(0);

      let lp1LiquidityReserveBalance = await liquidityReserve.balanceOf(
        liquidityProvider1
      );
      expect(lp1LiquidityReserveBalance).eq(stakingAmount);

      // get stakingToken at staker1
      await stakingToken.transfer(staker1, stakingAmount);

      const staking1Signer = accounts.find(
        (account) => account.address === staker1
      );

      // stake stakingToken to get rewardToken
      const stakingContractStaker1 = stakingContract.connect(
        staking1Signer as Signer
      );
      const stakingTokenStaker1 = stakingToken.connect(
        staking1Signer as Signer
      );

      await stakingTokenStaker1.approve(
        stakingContract.address,
        transferAmount
      );
      await stakingContractStaker1.functions["stake(uint256)"](stakingAmount);

      await stakingContractStaker1.claim(staker1);

      let staker1RewardBalance = await rewardToken.balanceOf(staker1);
      expect(staker1RewardBalance).eq(stakingAmount);

      const fee = await liquidityReserve.fee();

      // instant unstake with staker1
      const liquidityReserveStaker1 = liquidityReserve.connect(
        staking1Signer as Signer
      );

      const rewardTokenStaker1 = rewardToken.connect(staking1Signer as Signer);
      await rewardTokenStaker1.approve(liquidityReserve.address, stakingAmount);

      await liquidityReserveStaker1.instantUnstake(stakingAmount, staker1);

      const feeAmount = stakingAmount.mul(fee).div(10000);
      const amountMinusFee = stakingAmount.sub(feeAmount);

      staker1RewardBalance = await rewardToken.balanceOf(staker1);
      expect(staker1RewardBalance).eq(0);

      const staker1StakingBalance = await stakingToken.balanceOf(staker1);
      expect(staker1StakingBalance).eq(amountMinusFee);

      // withdraw and check liquidityProvider1
      lp1LiquidityReserveBalance = await liquidityReserve.balanceOf(
        liquidityProvider1
      );

      // withdraw with liquidityProvider1 && daoTreasury
      await liquidityReserveLiquidityProvider.removeLiquidity(
        lp1LiquidityReserveBalance
      );

      lp1StakingBalance = await stakingToken.balanceOf(liquidityProvider1);
      expect(lp1StakingBalance).eq(25111111111111); // receive 111111111111 as reward

      lp1LiquidityReserveBalance = await liquidityReserve.balanceOf(
        liquidityProvider1
      );
      expect(lp1LiquidityReserveBalance).eq(0);

      // withdraw and check daoTreasury
      daoLiquidityReserveBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      await liquidityReserveDao.removeLiquidity(daoLiquidityReserveBalance);

      daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(100444444444444); // receive 444444444444 (4x the reward)

      // lr tokens are 0
      daoLiquidityReserveBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      expect(daoLiquidityReserveBalance).eq(0);

      const daoTreasuryReward = daoTreasuryStakingBalance.sub(transferAmount);
      const lp1Reward = lp1StakingBalance.sub(stakingAmount);

      expect(daoTreasuryReward).eq(lp1Reward.mul(4));
    });
    it("Liquidity providers should get correct amounts", async () => {
      const { daoTreasury, staker1, liquidityProvider1 } =
        await getNamedAccounts();

      const transferAmount = BigNumber.from("100000000000000");
      const stakingAmount = transferAmount.div(4);

      // deposit stakingToken with daoTreasury
      await stakingToken.transfer(daoTreasury, transferAmount);

      let daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(transferAmount);

      let liquidityReserveBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      expect(liquidityReserveBalance).eq(0);

      const daoTreasurySigner = accounts.find(
        (account) => account.address === daoTreasury
      );
      const liquidityReserveDao = liquidityReserve.connect(
        daoTreasurySigner as Signer
      );
      const stakingTokenDao = stakingToken.connect(daoTreasurySigner as Signer);

      await stakingTokenDao.approve(liquidityReserve.address, transferAmount);
      await liquidityReserveDao.addLiquidity(transferAmount);

      daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(0);

      liquidityReserveBalance = await liquidityReserve.balanceOf(daoTreasury);
      expect(liquidityReserveBalance).eq(transferAmount);

      // get stakingToken at staker1
      await stakingToken.transfer(staker1, stakingAmount);

      const staking1Signer = accounts.find(
        (account) => account.address === staker1
      );

      // stake stakingToken to get rewardToken
      const stakingContractStaker1 = stakingContract.connect(
        staking1Signer as Signer
      );
      const stakingTokenStaker1 = stakingToken.connect(
        staking1Signer as Signer
      );

      await stakingTokenStaker1.approve(
        stakingContract.address,
        transferAmount
      );
      await stakingContractStaker1.functions["stake(uint256)"](stakingAmount);

      let staker1RewardBalance = await rewardToken.balanceOf(staker1);
      expect(staker1RewardBalance).eq(stakingAmount);

      const fee = await liquidityReserve.fee();

      // instant unstake with staker1
      const liquidityReserveStaker1 = liquidityReserve.connect(
        staking1Signer as Signer
      );

      const rewardTokenStaker1 = rewardToken.connect(staking1Signer as Signer);
      await rewardTokenStaker1.approve(liquidityReserve.address, stakingAmount);

      await liquidityReserveStaker1.instantUnstake(stakingAmount, staker1);

      const feeAmount = stakingAmount.mul(fee).div(10000);
      const amountMinusFee = stakingAmount.sub(feeAmount);

      staker1RewardBalance = await rewardToken.balanceOf(staker1);
      expect(staker1RewardBalance).eq(0);

      const staker1StakingBalance = await stakingToken.balanceOf(staker1);
      expect(staker1StakingBalance).eq(amountMinusFee);

      // deposit with liquidityProvider1
      await stakingToken.transfer(liquidityProvider1, stakingAmount);

      let liquidityProvider1StakingBalance = await stakingToken.balanceOf(
        liquidityProvider1
      );
      expect(liquidityProvider1StakingBalance).eq(stakingAmount);

      liquidityReserveBalance = await liquidityReserve.balanceOf(
        liquidityProvider1
      );
      expect(liquidityReserveBalance).eq(0);

      const liquidityProvider1Signer = accounts.find(
        (account) => account.address === liquidityProvider1
      );
      const liquidityReserveLiquidityProvider = liquidityReserve.connect(
        liquidityProvider1Signer as Signer
      );
      const stakingTokenLiquidityProvider = stakingToken.connect(
        liquidityProvider1Signer as Signer
      );

      await stakingTokenLiquidityProvider.approve(
        liquidityReserve.address,
        stakingAmount
      );
      await liquidityReserveLiquidityProvider.addLiquidity(stakingAmount);

      liquidityProvider1StakingBalance = await stakingToken.balanceOf(
        liquidityProvider1
      );
      expect(liquidityProvider1StakingBalance).eq(0);

      liquidityReserveBalance = await liquidityReserve.balanceOf(daoTreasury);
      expect(liquidityReserveBalance).eq(100000000000000);
      await liquidityReserveDao.removeLiquidity(liquidityReserveBalance);

      liquidityProvider1StakingBalance = await stakingToken.balanceOf(
        daoTreasury
      );
      expect(liquidityProvider1StakingBalance).eq(100454545454545); // balance after gaining rewards

      liquidityReserveBalance = await liquidityReserve.balanceOf(
        liquidityProvider1
      );
      expect(liquidityReserveBalance).eq(24886877828054); // 24886877828054 is the new balance based on new liquidity

      // withdraw with liquidityProvider1
      await liquidityReserveLiquidityProvider.removeLiquidity(
        liquidityReserveBalance
      );

      liquidityProvider1StakingBalance = await stakingToken.balanceOf(
        liquidityProvider1
      );
      expect(liquidityProvider1StakingBalance).eq(24999999999999); // no rewards due to staking after instantUnstake occured
    });
    it("Should not allow user to withdraw more than contract contains", async () => {
      const { daoTreasury, staker1 } = await getNamedAccounts();
      let lrStakingBalance = await stakingToken.balanceOf(
        liquidityReserve.address
      );
      expect(lrStakingBalance).eq(INITIAL_LR_BALANCE);

      const transferAmount = BigNumber.from("4000000000000000");

      await stakingToken.transfer(daoTreasury, transferAmount);

      let daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(transferAmount);

      let daoTreasuryLiquidityBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      expect(daoTreasuryLiquidityBalance).eq(0);

      const daoTreasurySigner = accounts.find(
        (account) => account.address === daoTreasury
      );
      const liquidityReserveDao = liquidityReserve.connect(
        daoTreasurySigner as Signer
      );
      const stakingTokenDao = stakingToken.connect(daoTreasurySigner as Signer);
      await stakingTokenDao.approve(liquidityReserve.address, transferAmount);
      await liquidityReserveDao.addLiquidity(transferAmount);

      daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(0);

      daoTreasuryLiquidityBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      expect(daoTreasuryLiquidityBalance).eq(transferAmount);

      // get stakingToken at staker1
      await stakingToken.transfer(staker1, transferAmount);

      const staking1Signer = accounts.find(
        (account) => account.address === staker1
      );

      // stake stakingToken to get rewardToken
      const stakingContractStaker1 = stakingContract.connect(
        staking1Signer as Signer
      );
      const stakingTokenStaker1 = stakingToken.connect(
        staking1Signer as Signer
      );

      await stakingTokenStaker1.approve(
        stakingContract.address,
        transferAmount
      );
      await stakingContractStaker1.functions["stake(uint256)"](transferAmount);

      await stakingContractStaker1.claim(staker1);

      let staker1RewardBalance = await rewardToken.balanceOf(staker1);
      expect(staker1RewardBalance).eq(transferAmount);

      const fee = await liquidityReserve.fee();
      lrStakingBalance = await stakingToken.balanceOf(liquidityReserve.address);

      // instant unstake with staker1
      const liquidityReserveStaker1 = liquidityReserve.connect(
        staking1Signer as Signer
      );

      const rewardTokenStaker1 = rewardToken.connect(staking1Signer as Signer);
      await rewardTokenStaker1.approve(
        liquidityReserve.address,
        transferAmount
      );

      await liquidityReserveStaker1.instantUnstake(transferAmount, staker1);

      const feeAmount = transferAmount.mul(fee).div(10000);
      const amountMinusFee = transferAmount.sub(feeAmount);

      staker1RewardBalance = await rewardToken.balanceOf(staker1);
      expect(staker1RewardBalance).eq(0);

      const staker1StakingBalance = await stakingToken.balanceOf(staker1);
      expect(staker1StakingBalance).eq(amountMinusFee);

      // withdraw all with DAO
      // should revert due to not enough stakingTokens in contract due to instant unstake
      lrStakingBalance = await stakingToken.balanceOf(liquidityReserve.address);
      expect(lrStakingBalance).eq(1800000000000000); // amount after instant unstake

      const daoBalance = await liquidityReserveDao.balanceOf(daoTreasury);
      expect(daoBalance).eq(4000000000000000); // more than staking tokens in liquidity reserve

      await expect(
        liquidityReserveDao.removeLiquidity(daoBalance)
      ).to.be.revertedWith("Not enough funds");
    });
  });

  describe("fail states", () => {
    it("Fails when no staking/reward token or staking contract is passed in", async () => {
      const { admin, staker1 } = await getNamedAccounts();

      const liquidityFactory = await ethers.getContractFactory(
        "LiquidityReserve"
      );

      // fail due to no staking/reward token
      await expect(
        liquidityFactory.deploy("0x0000000000000000000000000000000000000000")
      ).to.be.reverted;

      const liquidityReserveContract = await liquidityFactory.deploy(
        stakingToken.address
      );
      // fail due to no stakingContract
      await expect(
        liquidityReserveContract.initialize(
          "0x0000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.reverted;

      const transferAmount = await stakingToken.balanceOf(admin);
      await stakingToken.transfer(staker1, transferAmount);

      // fail due to not enough liquidity
      await expect(
        liquidityReserveContract.initialize(
          stakingContract.address,
          rewardToken.address
        )
      ).to.be.reverted;
    });

    it("Must have correct fee amount", async () => {
      await expect(
        liquidityReserve.setFee(BigNumber.from("10000000000"))
      ).to.be.revertedWith("Out of range");
    });

    it("Withdraw has required balance", async () => {
      await expect(
        liquidityReserve.removeLiquidity(BigNumber.from("10000000000"))
      ).to.be.revertedWith("Not enough lr tokens");
    });

    it("InstantUnstake has required balance", async () => {
      const { staker1 } = await getNamedAccounts();

      // try to instantUnstake without any reward tokens
      await expect(
        liquidityReserve.instantUnstake(BigNumber.from("10000"), staker1)
      ).to.be.reverted;

      // try to instantUnstake when liquidityReserve is drained
      const liquidityFactory = await ethers.getContractFactory(
        "LiquidityReserve"
      );
      const liquidityReserveContract = await liquidityFactory.deploy(
        stakingToken.address
      );
      await expect(
        liquidityReserveContract.instantUnstake(
          BigNumber.from("10000"),
          staker1
        )
      ).to.be.reverted;
    });
  });
});
