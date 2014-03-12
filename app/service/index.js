var _         = require('underscore');
var async     = require('async');
var networker = require('../lib/networker');

module.exports = new Service();

function Service () {

  var services = {};
  
  // Basic service, not requiring any configuration
  this.Key        = services.Key        = require("./KeyService");
  this.Merkle     = services.Merkle     = require("./MerkleService");
  this.HTTP       = services.HTTP       = require("./HTTPService");
  this.Merkle     = services.Merkle     = require("./MerkleService");

  this.init = function (pgp, currency, conf) {
    // Services requiring configuration
    this.Parameters   = services.Parameters   = require("./ParametersService").get(currency);
    this.PublicKey    = services.PublicKey    = require("./PublicKeyService").get(pgp, currency, conf);
    this.THT          = services.THT          = require("./THTService").get(pgp, currency, conf);
    this.Contract     = services.Contract     = require("./ContractService").get(currency, conf);
    this.Peering      = services.Peering      = require("./PeeringService").get(pgp, currency, conf);
    this.Sync         = services.Sync         = require("./SyncService").get(pgp, currency, conf);
    this.Strategy     = services.Strategy     = require("./StrategyService").get(pgp, currency, conf);
    this.Transactions = services.Transactions = require("./TransactionsService").get(pgp, currency, conf);
    this.Vote         = services.Vote         = require("./VoteService").get(pgp, currency, conf);

    // Binds Peering events to Networker
    networker(this.Peering);
  };

  /**
  * Load all services using asynchronous function.
  */
  this.load = function (done) {
    async.forEach(_(services).values(), function(service, callback){
      if (service.load)
        service.load(callback);
      else
        callback();
    }, done);
  };
}