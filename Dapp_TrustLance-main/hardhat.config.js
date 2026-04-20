require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const { API_URL, PRIVATE_KEY } = process.env;

console.log("API_URL loaded:", !!API_URL);
console.log("PRIVATE_KEY loaded:", !!PRIVATE_KEY);
console.log("PRIVATE_KEY length:", PRIVATE_KEY?.length);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545/",
      chainId: 31337,
    },
    // sepolia: {
    //   url: API_URL,
    //   accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
    // },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY, // Get an API key from https://etherscan.io/
  },
};
