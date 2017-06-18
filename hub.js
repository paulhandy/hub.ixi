var iri = com.iota.iri;
var Curl = iri.hash.Curl;
var ISS = iri.hash.ISS;
var Hash = iri.model.Hash;
var Arrays = Java.type("java.util.Arrays");
var Converter = iri.utils.Converter;
var LinkedList = java.util.LinkedList;
var Callable = iri.service.CallableRequest;
var Response = iri.service.dto.IXIResponse;
var Error = iri.service.dto.ErrorResponse;

//print("hello hub")
var MAX_NUMBER_OF_ADDRESSES_PER_ACCOUNT = 1000000;
var TIP_SELECTION_DEPTH = 3;
var hubs = new java.util.HashMap();// Map<Integer, Hub>
var worker;

function Account (accountName) {
  var pendingSweeps;
  this.balance = 0;
  this.credit = 0;
  this.name = accountName;
  pendingSweeps = new LinkedList();
  this.addresses = new LinkedList();

  this.depositAddress = function() {
    return this.addresses.isEmpty() ? null : this.addresses.get(this.addresses.size() - 1);
  }

  this.generateNewAddress = function(seed, securityLevel, accountIndex) {
    var address, curl, addressWithChecksum;
    if (seed.length() != 81 || securityLevel < 1 || securityLevel > 3) {
      throw new java.lang.RuntimeException("Invalid seed or securityLevel");
    }
    address = ISS.address(ISS.digests(ISS.key(ISS.subseed(Converter.trits(seed), this.accountIndex * MAX_NUMBER_OF_ADDRESSES_PER_ACCOUNT + this.addresses.size()), securityLevel)));
    curl = new Curl();
    curl.absorb(address, 0, address.length);
    addressWithChecksum = Arrays.copyOf(address, address.length + 27);
    curl.squeeze(addressWithChecksum, address.length, 27);
    this.addresses.add(Converter.trytes(addressWithChecksum));
  }

  this.credit = function(value, sweep) {
    pendingSweeps.remove(sweep);
    credit += value;
  }

  this.setBalance = function(value) {
    balance = value;
  }
}

function Hub () {
  //this.latestSynchronizationMilestone; //int 
  this.accounts = new LinkedList(); //List<Account> 
}

function Worker (){
  var maxSweepSize = 10;

  this.getLastestMilestone = function() {
    //fetch latest milestone
    return IOTA.latestSnapshot.index();
  }

  this.getBalance = function (account) {
    //get balance of all addresses
    var addresses = account.addresses.stream().map(function(address) {new Hash(address)})
      .collect(java.util.stream.Collectors.toList());

    var balances = new java.util.HashMap();
    var latestSnapshotMap = IOTA.latestSnapshot.getState();
    for (var i = 0; i < addresses.size(); i++) {
      var address = addresses.get(i);
      balances.put(address,
        latestSnapshotMap.containsKey(address) ?
        latestSnapshotMap.get(address) : java.lang.Long.valueOf(0));
    }
    return balances.values()
      .stream()
      .reduce(function(a,b) a+b).orElse(java.lang.Long.MAX_VALUE);
  }

  this.isSweepConfirmed = function (sweep) {
    //get inclusion state of sweep
    var transactionViewModel = TransactionViewModel.fromHash(IOTA.tangle, new Hash(sweep));
    return transactionViewModel.snapshotIndex()!=0;
  }

  this.getSweepAmount = function (sweep) {
    //get value of sweep (in positive value)
    var transactionViewModel = TransactionViewModel.fromHash(IOTA.tangle, new Hash(sweep));
    return (-1) * transactionViewModel.value();
  }

  this.sweepAccounts = function(seed, securityLevel, hub, sweepAccountIndexes, destination) {
    var j;
    for (j = 0; j < sweepAccountIndexes.size(); j++) {
      var i = sweepAccountIndexes.get(i);
      //go over accounts & sweep them
      var account = hub.accounts.get(i);
      var txs = sendTransfer(seed, securityLevel, i,account.addresses.size(), destination);

      //write to each account the pending sweep tx
      var k;
      for (k = 0; k < txs.size(); k++) {
        var tx = txs.get(k);
        var transactionViewModel = TransactionViewModel.fromHash(IOTA.tangle, new Hash(tx));
        if (account.addresses.contains(transactionViewModel.getAddressHash().toString())) {
          account.pendingSweeps.add(tx);
        }
      }
    }
  }

  function sendAccountBalance(seed, security, account, total, destination) {
    //TODO STUB
    //TODO - don't forget to deal w/ change!
    var start = accountIndex * MAX_NUMBER_OF_ADDRESSES_PER_ACCOUNT;
    var depth = TIP_SELECTION_DEPTH;
    var minWeightMagnitude = IOTA.transactionValidator.getMinWeightMagnitude();
    //TODO transfers
    //transfers = [{"address": destination, "value": value}]
    //TODO inputs
    //inputs = []
    for (var i=0; i < account.addresses.size(); i++) {
      var address = account.addresses.get(i);
      var index = start + i;
      //inputs.push = [{"address": address, "keyIndex": index, "security": security}]
    }
    var changeAddress = destination;

    //TODO sendTransfer

    //TODO return hashes

    var txs = new LinkedList();
    txs.add("ALON999");
    txs.add("ALON999");
    return txs;
  }
}



function create(request) {
  var hubId = parseInt(request.get("hubId"));

  if (hubs.containsKey(hubId)) {
    return Response.create({
      error: 1,
      errorMessage: "Hub #" + hubId + " already exists!"
    });
  }

  hubs.put(hubId, new Hub());

  return Response.create({ error: 0, errorMessage: ""});
}

function attach (request) {

  var hubId = parseInt(request.get("hubId"));
  var hub = request.get("hubState");
  if (hubs.containsKey(hubId)) {

    return Response.create({ 
      error: 1, 
      errorMessage: "Hub #" + hubId + " is already attached!"
    });
  }

  hubs.put(hubId, hub);

  return Response.create({ error: 0, errorMessage: ""});
}

function synchronize (request) {

  var hubId = parseInt(request.get("hubId"));
  var seed = request.get("seed");
  var securityLevel = parseInt(request.get("securityLevel"));
  var destination = request.get("destination");
  var hub = hubs.get(hubId);
  if (hub == null) {

    return Response.create({
      errorCode: 2, 
      errorMessage: "Hub #" + hubId + " is not attached!", 
      latestSynchronizationMilestone: -1
    });
  }

  hub.latestSynchronizationMilestone = worker.getLastestMilestone();
  var sweepAccountIndexes = new LinkedList();//List<Integer>

  for (var i = 0; i < hub.accounts.size(); i++) {
    var account = hub.accounts.get(i);
    if (account.addresses.isEmpty()) {
      account.generateNewAddress(seed, securityLevel,i);
    } else {
      // if account has balance - mark for sweeping
      account.setBalance(worker.getBalance(account));
      if (account.pendingSweeps.isEmpty() && account.balance != 0) {
        sweepAccountIndexes.add(i);
        account.setBalance(worker.getBalance(account));
      }

      // if account was recently swept & sweep approved
      if (!account.pendingSweeps.isEmpty()) {
        var hasConfrimedSweep = false;
        var pendingSweepsIterator = account.pendingSweeps.iterator();
        while(pendingSweepsIterator.hasNext()) {
          var sweep = pendingSweepsIterator.next();
          if (worker.isSweepConfirmed(sweep)) {
            //credit, gen new addy.
            var value = worker.getSweepAmount(sweep);
            if (value > 0) {
              account.credit(value,sweep);
            }
            hasConfrimedSweep = true;
          }
        }
        if (hasConfrimedSweep) {
          account.generateNewAddress(seed, securityLevel, i);
        }
      }

    }
  }
  // actually sweep
  worker.sweepAccounts(seed, securityLevel, hub, sweepAccountIndexes, destination);

  return Response.create({
    errorCode: 0, 
    errorMessage: "", 
    latestSynchronizationMilestone: hub.latestSynchronizationMilestone
  });
}

function detach (request) {

  var hubId = parseInt(request.get("hubId"));

  var hub = hubs.remove(hubId);
  if (hub == null) {
    return Response.create({
      errorCode: 2, 
      errorMessage: "Hub #" + hubId + " is not attached!",
    });
  }

  return Response.create({
    errorCode: 0, 
    errorMessage: "",
    state: hub.toString()
  });
}

function getState (request) {
  var hubId = parseInt(request.get("hubId"));
  var hub = hubs.get(hubId);

  if (hub == null) {
    return Response.create({
      errorCode: 2, 
      errorMessage: "Hub #" + hubId + " is not attached!",
    });
  }

  return Response.create({
    errorCode: 0, 
    errorMessage: "",
    state: hub.toString()
  });
}

function registerAccount (request) {

  var hubId = parseInt(request.get("hubId"));
  var AccountName = request.get("accountName");

  var hub = hubs.get(hubId);
  if (hub == null) {
    return Response.create({
      errorCode: 2, 
      errorMessage: "Hub #" + hubId + " is not attached!",
      accountIndex: -1
    });
  }

  hub.accounts.add(new Account(AccountName));

  return Response.create({
    errorCode: 0, 
    errorMessage: "",
    accountIndex: hub.accounts.size() - 1
  });
}

function getDepositAddress (request) {

  var hubId = parseInt(request.get("hubId"));
  var accountIndex = parseInt(request.get("accountIndex"));
  var hub = hubs.get(hubId);
  if (hub == null) {
    return Response.create({
      errorCode: 2, 
      errorMessage: "Hub #" + hubId + " is not attached!",
    });
  }

  if (accountIndex < 0 || accountIndex >= hub.accounts.size()) {

    return Response.create({
      errorCode: 3, 
      errorMessage: "Account #" + accountIndex + " does not exist!", 
    });
  }

  var account = hub.accounts.get(accountIndex);
  if (account.addresses.isEmpty()) {
    return Response.create({
      errorCode: 4, 
      errorMessage: "There is no an address assigned to the account yet!", 
      address: "null"
    });
  }

  return Response.create({
    errorCode: 0, 
    errorMessage: "", 
    address: account.depositAddress()
  });
}

worker = new Worker();

API.put("create", new Callable({ call: create }));
API.put("attach", new Callable({ call: attach}));
API.put("synchronize", new Callable({ call: synchronize}));
API.put("detach", new Callable({ call: detach}));
API.put("getState", new Callable({ call: getState}));
API.put("registerAccount", new Callable({ call: registerAccount}));
API.put("getDepositAddress", new Callable({ call: getDepositAddress}));
