var async            = require('async');
var _                = require('underscore');
var es               = require('event-stream');
var jsoner           = require('../lib/streams/jsoner');
var dos2unix         = require('../lib/dos2unix');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var link2pubkey      = require('../lib/streams/link2pubkey');
var extractSignature = require('../lib/streams/extractSignature');
var verifySignature  = require('../lib/streams/verifySignature');
var logger           = require('../lib/logger')('transaction');

module.exports = function (txServer) {
  return new TransactionBinding(txServer);
};

function TransactionBinding(txServer) {

  var that = this;
  var conf = txServer.conf;

  // Services
  var http              = txServer.HTTPService;
  var ParametersService = txServer.ParametersService;
  var PeeringService    = txServer.PeeringService;
  var BlockchainService = txServer.BlockchainService;

  // Models
  var Peer       = txServer.conn.model('Peer');
  var Membership = txServer.conn.model('Membership');

  this.parseTransaction = function (req, res) {
    var onError = http400(res);
    http2raw.transaction(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseTransaction(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      // .pipe(extractSignature(onError))
      // .pipe(verifySignature(onError))
      .pipe(txServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  }
  
  return this;
}
