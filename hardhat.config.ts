import * as dotenv from "dotenv";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-deploy";
import "solidity-coverage";
import { HardhatUserConfig } from "hardhat/types";

dotenv.config();

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 100000,
      },
    },
  },
  networks: {
    hardhat: {
      deploy: ["deploy/core", "deploy/main"],
      chainId: 1,
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
      forking: {
        url: process.env.MAINNET_URL || "",
        blockNumber: Number(process.env.BLOCK_NUMBER),
        enabled: true, // Set to false to disable forked mainnet mode
      },
    },
    goerli: {
      url: process.env.GOERLI_URL || "",
      deploy: ["deploy/core", "deploy/test"],
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    mainnet: {
      url: process.env.MAINNET_URL || "",
      deploy: ["deploy/core", "deploy/main"],
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    deploy: ["deploy/core", "deploy/main"],
    sources: "./src",
  },
  namedAccounts: {
    admin: {
      default: 0,
    },
    daoTreasury: {
      default: 1,
    },
    staker1: {
      default: 2,
    },
    staker2: {
      default: 3,
    },
    staker3: {
      default: 4,
    },
    stakingContractMock: {
      default: 5,
    },
    liquidityProvider1: {
      default: 6,
    },
    liquidityProvider2: {
      default: 7,
    },
    liquidityProvider3: {
      default: 8,
    },
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
  },
  gasReporter: {
    enabled: false,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 80000,
  },
};
export default config;
