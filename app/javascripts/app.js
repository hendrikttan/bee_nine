var accounts;
var account;
var balance;
var totalProjects;
var fundinghub = FundingHub.deployed();
var checkTransactionCounter = 0;

function setStatus(message) {
  var status = document.getElementById("status");
  status.innerHTML = message;
};

function refreshProjects() {
  log("fundinghub: " + fundinghub);
  checkTransactionCounter = 0;

  fundinghub.totalProjects.call().then(function(res_totalProjects) {
    totalProjects = res_totalProjects;
    log("totalProjects: " + totalProjects);
    document.getElementById("totalProjects").innerHTML = totalProjects;

    if (totalProjects==0) {
    } else {
      document.getElementById("projectList").innerHTML = "";
      var div = document.querySelector("#projectList");
      frag = document.createDocumentFragment();
      select = document.createElement("select");
      select.id = "selectedProject";

      for (i=1; i<=totalProjects;i++) {

        fundinghub.mapIndexToAddress.call(i).then(function(res_projectAddress){
          var project = Project.at(res_projectAddress);
          project.campaign.call().then(function(res_campaign){
            var description = res_campaign[1];
            var goal = res_campaign[2];
            var totalRaised = res_campaign[3];
            var deadline = res_campaign[4];
            select.options.add( new Option(description + " - Goal_" + goal + " Finney",res_projectAddress, true, true));
            return Promise.all(res_campaign).then(function(res_campaign) {
              log("res_campaign: " + res_campaign);
            });
          });
          return Promise.all(res_projectAddress).then(function(res_projectAddress) {
            log("res_projectAddress: " + res_projectAddress);
          });
        });
      }
      frag.appendChild(select);
      div.appendChild(frag);
    }
  });
}

function sendCoin() {
  /*
  var meta = MetaCoin.deployed();

  var amount = parseInt(document.getElementById("amount").value);
  var receiver = document.getElementById("receiver").value;

  setStatus("Initiating transaction... (please wait)");

  meta.sendCoin(receiver, amount, {from: account}).then(function() {
    setStatus("Transaction complete!");
    refreshBalance();
  }).catch(function(e) {
    console.log(e);
    setStatus("Error sending coin; see log.");
  });
  */
}

window.onload = function() {
  web3.eth.getAccounts(function(err, accs) {
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }

    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }

    accounts = accs;
    account = accounts[0];

    fundinghub = FundingHub.deployed();
    refreshProjects();
  });
}

function createProject() {
  var description = document.getElementById("description").value;
  var goal = parseInt(document.getElementById("goal").value);
  var duration = parseInt(document.getElementById("duration").value);
  log("Description: " + description);
  log("goal: " + goal);
  log("duration: " + duration);

  fundinghub.createProject(description, goal, duration, {from:accounts[0], gas:3000000, gasPrice:web3.toWei(60, 'gwei')}).then(function(result){
    log("createProjectResult: " + result);
    checkTransaction("createProject", result);
  });
}

function checkTransaction(method, result) {
  checkTransactionCounter++;
  log("checkTransactionCounter: " + checkTransactionCounter);
  var refreshTimeout = 3000;
  var txHash = result;
  web3.eth.getTransaction(txHash, function (error, result) {
    log("getTransaction:result: " + result);
    if (result!=null)
      log("getTransaction:result.blockHash " + result.blockHash);
    if (result==null || (result!=null && result.blockHash==null)) {
      setInterval(checkTransaction(method, txHash), refreshTimeout);
    } else {
      var gasSent = result.gas;
      checkTransactionReceipt(method, txHash, gasSent);
    }
  });
}

function checkTransactionReceipt(method, txHash, gasSent) {
  web3.eth.getTransactionReceipt(txHash, function (error, result) {
    if (result==null) {
        setTimeout(checkTransactionReceipt(method, txHash, gasSent), refreshTimeout);
    } else {
      if (result!=null) {
        log("finalResult: " + result);
        refreshProjects();
      }
    }
  });
}

function contribute() {
  var selectedProject = document.getElementById("selectedProject");
  var selectedProjectAddress = selectedProject.options[selectedProject.selectedIndex].value;
  var amount = getElementByIdValue("amount");
  alert("selectedProjectAddress:[" + selectedProjectAddress + "]: " + amount);
  fundinghub.contribute(selectedProjectAddress, {from: accounts[1], value: web3.toWei(amount, "finney")}).then(function(result) {
    alert("contributeProjectResult: " + result);
    log("contributeProjectResult: " + result);
    checkTransaction("contributeProjectResult", result);
  });
}

function getElementByIdValue(id) {
  return document.getElementById(id).value;
}

function log(logMessage) {
  console.log(logMessage);
}
