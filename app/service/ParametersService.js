var async   = require('async');
var status  = require('../models/statusMessage');
var parsers = require('../lib/streams/parsers/doc');

module.exports.get = function (conn, currencyName) {
  return new ParameterNamespace(conn, currencyName);
};

function ParameterNamespace (conn, currency) {

  var that = this;
  var Membership  = conn.model('Membership');
  var Peer        = conn.model('Peer');
  var Transaction = conn.model('Transaction');

  this.getSearch = function (req, callback) {
    if(!req.params || !req.params.search){
      callback("No search criteria given");
      return;
    }
    callback(null, req.params.search);
  };

  this.getFingerprint = function (req, callback){
    if(!req.params.fpr){
      callback("Fingerprint is required");
      return;
    }
    var matches = req.params.fpr.match(/([A-Z0-9]{40})/);
    if(!matches){
      callback("Fingerprint format is incorrect, must be an upper-cased SHA1 hash");
      return;
    }
    callback(null, matches[1]);
  };

  this.getNumber = function (req, callback){
    if(!req.params.number){
      callback("Number is required");
      return;
    }
    var matches = req.params.number.match(/^(\d+)$/);
    if(!matches){
      callback("Number format is incorrect, must be a positive integer");
      return;
    }
    callback(null, matches[1]);
  };

  this.getCount = function (req, callback){
    if(!req.params.count){
      callback("Count is required");
      return;
    }
    var matches = req.params.count.match(/^(\d+)$/);
    if(!matches){
      callback("Count format is incorrect, must be a positive integer");
      return;
    }
    var count = parseInt(matches[1], 10);
    if(count <= 0){
      callback("Count must be a positive integer");
      return;
    }
    callback(null, matches[1]);
  };

  this.getTransactionID = function (req, callback) {
    async.series({
      fprint: async.apply(that.getFingerprint, req),
      number: async.apply(that.getNumber, req)
    },
    function(err, results) {
      callback(null, results.fprint, results.number);
    });
  };

  this.getAmendmentID = function (req, callback) {
    if(!req.params || !req.params.amendment_id){
      callback("Amendment ID is required");
      return;
    }
    var matches = req.params.amendment_id.match(/^(\d+)-(\w{40})$/);
    if(!matches){
      callback("Amendment ID format is incorrect, must be 'number-hash'");
      return;
    }
    callback(null, matches[1], matches[2]);
  };

  this.getAmendmentNumber = function (req, callback) {
    if(!req.params || !req.params.am_number){
      callback("Amendment number is required");
      return;
    }
    var matches = req.params.am_number.match(/^(\d+)$/);
    if(!matches){
      callback("Amendment number format is incorrect, must be an integer value");
      return;
    }
    callback(null, matches[1]);
  };

  this.getAmendmentNumberAndAlgo = function (req, callback) {
    if(!req.params || !req.params.am_number){
      callback("Amendment number is required");
      return;
    }
    if(!req.params || !req.params.algo){
      callback("Algorithm is required");
      return;
    }
    var matchAMNumber = req.params.am_number.match(/^(\d+)$/);
    if(!matchAMNumber){
      callback("Amendment number format is incorrect, must be an integer value");
      return;
    }
    var matchAlgo = req.params.algo.match(/^(AnyKey|1Sig)$/);
    if(!matchAlgo){
      callback("Algorithm is incorrect, must be either AnyKey or 1Sig");
      return;
    }
    callback(null, matchAMNumber[1], matchAlgo[1]);
  };

  this.getCoinID = function (req, callback) {
    if(!req.params || !req.params.coin_id){
      callback("Coin ID is required");
      return;
    }
    var matches = req.params.coin_id.match(/^(\w{40})-(\d+)-(\d+)$/);
    if(!matches){
      callback("Coin ID format is incorrect, must be 'hash-amNumber-coinNumber'");
      return;
    }
    callback(null, matches[1], matches[2], matches[3]);
  };
}
