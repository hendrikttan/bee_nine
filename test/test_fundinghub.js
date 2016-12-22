contract('FundingHub', function(accounts) {
  var campaignLengthInMinutes = 1;
  var campaignGoalInFinney = 2;

  it("should have zero project when initially deployed", function(){
    log();
    var fundinghub = FundingHub.deployed();
    fundinghub.totalProjects.call().then(function(totalProjects){
      log("Total Projects          : " +totalProjects);
      return assert.equal(totalProjects, 0, "there isn't zero project.");
    });
  });

  it("should have 1 project after creating a project", function(){
    log();
    var fundinghub = FundingHub.deployed();

    fundinghub.createProject("Project1", campaignGoalInFinney, campaignLengthInMinutes, {from: accounts[1]}).then(function(result){
      log("Transaction Result      : " + result);
      log("Transaction             : " + accounts[1] + " creates a project with campaign goal " + campaignGoalInFinney + " finney and campaign deadline " + campaignLengthInMinutes + " minutes.");
      fundinghub.totalProjects.call().then(function(totalProjects) {
          log("Total Projects          : " +totalProjects);
          return assert.equal(totalProjects, 1, "there isn't 1 project.");
      });
    });
  });

  it("should have the same contributed amount after a finney is placed", function(){
    log();
    var fundinghub = FundingHub.deployed();
    fundinghub.mapIndexToAddress.call(1).then(function(project1address){
      var initialContribution = 1;
      log("Transaction             : " + accounts[1] + " contributes " + initialContribution + " finney before campaign deadline.");
      fundinghub.contribute(project1address, {from: accounts[1], value: web3.toWei(initialContribution, "finney")}).then(function(result) {
        var project = Project.at(project1address);
        project.campaign.call().then(function(result){
          var totalRaised = result[3];
          log("Campaign1 Balance       : " + web3.eth.getBalance(project1address));
          log("Campaign1 Total Raised  : " + totalRaised);
          return assert.equal(totalRaised, initialContribution * Math.pow(10, 15), "there isn't 1 finney");
        });
      });
    });
  });

  it("should have refunded the contribution", function(){
    log();
    var fundinghub = FundingHub.deployed();
    var timeout = (campaignLengthInMinutes + 1) * 60 * 1000;
      fundinghub.mapIndexToAddress.call(1).then(function(project1address){
        setTimeout(function() {
          var contribution = 1;
          log("Status                  : After " + (campaignLengthInMinutes + 1) + " minutes lapsed, campaign deadline has passed.");
          log("Transaction             : " + accounts[1] + " contributes " + contribution + " finney after campaign deadline. Contributions returned to contributor.");
          fundinghub.contribute(project1address, {from: accounts[1], value: web3.toWei(contribution, "finney")}).then(function(result) {
          var project = Project.at(project1address);
          log("Campaign1 Balance       : " + web3.eth.getBalance(project1address));
          project.campaign.call().then(function(result){
            var totalRaised = result[3];
            log("Campaign1 Total Raised  : " + totalRaised);
            return false;
          });
        });
      }, timeout);
      });
  });
});

function log(logMessage) {
  if (logMessage!=null && logMessage!="") {
    console.log(new Date() + ": " + logMessage);
  } else {
    console.log("");
  }
};
