var async     = require('async');
var status    = require('../models/statusMessage');
var parsers   = require('../lib/streams/parsers/doc');
var constants = require('../lib/constants');

module.exports.get = function (conn, currencyName) {
  return new ParameterNamespace(conn, currencyName);
};

function ParameterNamespace (conn, currency) {

  var that = this;
  var Peer        = conn.model('Peer');
  var Transaction = conn.model('Transaction');

  this.getSearch = function (req, callback) {
    if(!req.params || !req.params.search){
      callback("No search criteria given");
      return;
    }
    callback(null, req.params.search);
  };

  this.getCountAndFrom = function (req, callback){
    if(!req.params.from){
      callback("From is required");
      return;
    }
    if(!req.params.count){
      callback("Count is required");
      return;
    }
    var matches = req.params.from.match(/^(\d+)$/);
    if(!matches){
      callback("From format is incorrect, must be a positive integer");
      return;
    }
    var matches2 = req.params.count.match(/^(\d+)$/);
    if(!matches){
      callback("Count format is incorrect, must be a positive integer");
      return;
    }
    callback(null, matches2[1], matches[1]);
  };

  this.getPubkey = function (req, callback){
    if(!req.params.pubkey){
      callback('Parameter `pubkey` is required');
      return;
    }
    var matches = req.params.pubkey.match(constants.PUBLIC_KEY);
    if(!matches){
      callback("Pubkey format is incorrect, must be a Base58 string");
      return;
    }
    callback(null, matches[0]);
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
    callback(null, parseInt(matches[1]));
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
}
