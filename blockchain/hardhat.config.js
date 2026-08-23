require("@nomiclabs/hardhat-ethers");

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      // NEW: the Batch struct grew enough fields (13) that Solidity's
      // normal codegen hits "stack too deep" trying to build it in one
      // constructor call. viaIR (a newer, smarter compilation pipeline)
      // resolves this without changing any contract logic. The
      // optimizer is required alongside viaIR.
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
};
