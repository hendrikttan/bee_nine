module.exports = function(deployer) {
  deployer.deploy(FundingHub).then(
    function(instance) {
      console.log("FundingHub address: " + FundingHub.address);
    }
  );
};
