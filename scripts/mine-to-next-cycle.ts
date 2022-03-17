// used to mine to the next cycle when testing with a local node
// will also sendWithdrawalRequests
// will only work on local node or local hardhat nodes

import { tokePoolAbi } from "../src/abis/tokePoolAbi";
import { tokeManagerAbi } from "../src/abis/tokeManagerAbi";

const hardhat = require("hardhat");
const TOKE_ADDRESS = "0x808D3E6b23516967ceAE4f17a5F9038383ED5311"; // tFOX Address
const TOKE_OWNER = "0x90b6c61b102ea260131ab48377e143d6eb3a9d4b"; // owner of Tokemak Pool
const LATEST_CLAIMABLE_HASH = "QmWCH3fhEfceBYQhC1hkeM7RZ8FtDeZxSF4hDnpkogXM6W"; // example hash for claiming TOKE

async function mineBlocks() {
  const { deployments, ethers, network } = hardhat;
  let accounts = await ethers.getSigners();
  let stakingDeployments = await deployments.get("Staking");
  let staking = new ethers.Contract(
    stakingDeployments.address,
    stakingDeployments.abi,
    accounts[0]
  );

  const tokePool = new ethers.Contract(TOKE_ADDRESS, tokePoolAbi, accounts[0]);
  const tokeManagerAddress = await tokePool.manager();

  const tokeManager = new ethers.Contract(
    tokeManagerAddress,
    tokeManagerAbi,
    accounts[0]
  );

  // complete rollover
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [TOKE_OWNER],
  });
  const tokeSigner = await ethers.getSigner(TOKE_OWNER);
  const tokeManagerOwner = tokeManager.connect(tokeSigner);

  await tokeManagerOwner.completeRollover(LATEST_CLAIMABLE_HASH);

  // mine to next cycle
  let currentBlock = await ethers.provider.getBlockNumber();
  let cycleDuration = await tokeManager.getCycleDuration();
  let cycleStart = await tokeManager.getCurrentCycle();
  let blocksTilNextCycle =
    cycleStart.toNumber() + cycleDuration.toNumber() - currentBlock;
  while (blocksTilNextCycle > 0) {
    blocksTilNextCycle--;
    await network.provider.request({
      method: "evm_mine",
      params: [],
    });
  }

  // send withdrawal request
  await staking.sendWithdrawalRequests();
  await staking.rebase();
}

mineBlocks()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
