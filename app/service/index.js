
module.exports = new Service();

function Service () {
  
  // Basic service, not requiring any configuration
  this.Key        = require("./KeyService");
  this.Parameters = require("./ParametersService");
  this.Merkle     = require("./MerkleService");
  this.HTTP       = require("./HTTPService");
  this.Merkle     = require("./MerkleService");

  this.init = function (pgp, currency, conf) {
    // Services requiring configuration
    this.PublicKey    = require("./PublicKeyService").get(pgp, currency, conf);
    this.THT          = require("./THTService").get(pgp, currency, conf);
    this.Sync         = require("./SyncService").get(pgp, currency, conf);
    this.Strategy     = require("./StrategyService").get(pgp, currency, conf);
    this.Transactions = require("./TransactionsService").get(pgp, currency, conf);
    this.Peering      = require("./PeeringService").get(pgp, currency, conf);
    this.Vote         = require("./VoteService").get(pgp, currency, conf);
  };
}