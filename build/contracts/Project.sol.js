var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("Project error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("Project error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("Project contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of Project: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to Project.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: Project not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": true,
        "inputs": [],
        "name": "campaign",
        "outputs": [
          {
            "name": "owner",
            "type": "address"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "goal",
            "type": "uint256"
          },
          {
            "name": "totalRaised",
            "type": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "fund",
        "outputs": [
          {
            "name": "status",
            "type": "bool"
          }
        ],
        "payable": true,
        "type": "function"
      },
      {
        "inputs": [
          {
            "name": "_description",
            "type": "string"
          },
          {
            "name": "_goalInFinney",
            "type": "uint256"
          },
          {
            "name": "_durationInMinutes",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          }
        ],
        "name": "FundingSuccessful",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          }
        ],
        "name": "FundingUnsuccessful",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "contributor",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "Contribute",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "beneficiary",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "Payout",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "contributor",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "Refund",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "Throw",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405234610000576040516106f03803806106f083398101604090815281516020830151918301519201915b6040805160c08101825232808252602080830187905266038d7ea4c68000860293830193909352600060608301819052603c850242016080840152600160a084018190528154600160a060020a0319166c010000000000000000000000009384029390930492909217815586518254838352939491937fb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf6600261010083871615026000190190921691909104601f9081018490048201938a01908390106100ff57805160ff191683800117855561012c565b8280016001018555821561012c579182015b8281111561012c578251825591602001919060010190610111565b5b5061014d9291505b808211156101495760008155600101610135565b5090565b505060408201516002820155606082015160038201556080820151600482015560a0909101516005909101805460ff19167f0100000000000000000000000000000000000000000000000000000000000000928302929092049190911790555b5050505b610531806101bf6000396000f3606060405260e060020a6000350463811e539c8114610029578063b60d4288146100ef575b610000565b346100005761003661010b565b60408051600160a060020a0388168152908101859052606081018490526080810183905281151560a082015260c0602082018181528754600260001961010060018416150201909116049183018290529060e0830190889080156100db5780601f106100b0576101008083540402835291602001916100db565b820191906000526020600020905b8154815290600101906020018083116100be57829003601f168201915b505097505050505050505060405180910390f35b6100f7610132565b604080519115158252519081900360200190f35b600054600254600354600454600554600160a060020a039094169360019392919060ff1686565b60045460009042111561024157604051600160a060020a033216903480156108fc02916000818181858888f19350505050151561019357604080516001815290516000805160206105118339815191529181900360200190a1506000610370565b60025460035410156101f0576040805142815290517fac07b6ce7044283fa399491f7d9058cfcf6c24ab7e60b8a7f7bc86e54a794e609181900360200190a16005805460ff191690556101e532610375565b90506103705661023c565b6005805460ff191690556040805142815290517ffdf90517dc95552c27d09ce7fd8125b0698a4cdbb7a234335494b4d1a031cc8d9181900360200190a16101e5610456565b9050610370565b610370565b6002546003541080159061025c575060055460ff1615156001145b1561030557604051600160a060020a033216903480156108fc02916000818181858888f1935050505015156102b557604080516002815290516000805160206105118339815191529181900360200190a1506000610370565b6040805142815290517ffdf90517dc95552c27d09ce7fd8125b0698a4cdbb7a234335494b4d1a031cc8d9181900360200190a16005805460ff191690556101e5610456565b905061037056610370565b600160a060020a0332166000818152600660209081526040918290203490819055600380548201905582514281529182019390935280820192909252517fae8785da7bae7df1ae7a3d1838c261e59d1c7294715e21a2d56b9968650a73f49181900360600190a15060015b5b5b90565b600160a060020a03811660009081526006602052604081205480151561039a57610000565b600160a060020a0383166000818152600660205260408082208290555183156108fc0291849190818181858888f19350505050151561040257604080516004815290516000805160206105118339815191529181900360200190a16000915061044f5661044f565b60408051428152600160a060020a038516602082015280820183905290517f21e12a7cad0da5928167e1084ea4d5fdf8d9af66657a2543a9ac76a0ca0814779181900360600190a1600191505b5b50919050565b600380546000918290558154604051600160a060020a039091169082156108fc0290839085818181858888f1935050505015156104bc57604080516003815290516000805160206105118339815191529181900360200190a16000915061050c5661050c565b60005460408051428152600160a060020a039092166020830152818101839052517f5f7341a552ae2d452b071917104c05fbac3663936a69be768a05c40605056e7d9181900360600190a1600191505b5b509056f3dae87b6bb89061226d010cadc0b8c19d6aff8842e9e713661deaaea1488816",
    "updated_at": 1481988943802,
    "links": {},
    "events": {
      "0xfdf90517dc95552c27d09ce7fd8125b0698a4cdbb7a234335494b4d1a031cc8d": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          }
        ],
        "name": "FundingSuccessful",
        "type": "event"
      },
      "0xac07b6ce7044283fa399491f7d9058cfcf6c24ab7e60b8a7f7bc86e54a794e60": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          }
        ],
        "name": "FundingUnsuccessful",
        "type": "event"
      },
      "0xae8785da7bae7df1ae7a3d1838c261e59d1c7294715e21a2d56b9968650a73f4": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "contributor",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "Contribute",
        "type": "event"
      },
      "0x5f7341a552ae2d452b071917104c05fbac3663936a69be768a05c40605056e7d": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "beneficiary",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "Payout",
        "type": "event"
      },
      "0x21e12a7cad0da5928167e1084ea4d5fdf8d9af66657a2543a9ac76a0ca081477": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "contributor",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "Refund",
        "type": "event"
      },
      "0xf3dae87b6bb89061226d010cadc0b8c19d6aff8842e9e713661deaaea1488816": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "index",
            "type": "uint256"
          }
        ],
        "name": "Throw",
        "type": "event"
      }
    }
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "Project";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.Project = Contract;
  }
})();
