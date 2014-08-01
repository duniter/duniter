var jpgp             = require('../lib/jpgp');
var async            = require('async');
var vucoin           = require('vucoin');
var _                = require('underscore');
var es               = require('event-stream');
var unix2dos         = require('../lib/unix2dos');
var versionFilter    = require('../lib/streams/versionFilter');
var currencyFilter   = require('../lib/streams/currencyFilter');
var http2raw         = require('../lib/streams/parsers/http2raw');
var jsoner           = require('../lib/streams/jsoner');
var http400          = require('../lib/http/http400');
var parsers          = require('../lib/streams/parsers/doc');
var link2pubkey      = require('../lib/streams/link2pubkey');
var extractSignature = require('../lib/streams/extractSignature');
var verifySignature  = require('../lib/streams/verifySignature');
var logger           = require('../lib/logger')();
var mlogger          = require('../lib/logger')('membership');

module.exports = function (wotServer) {
  return new KeychainBinding(wotServer);
}

function KeychainBinding (wotServer) {

  var that = this;

  // Services
  var http              = wotServer.HTTPService;
  var MerkleService     = wotServer.MerkleService;
  var ParametersService = wotServer.ParametersService;
  var PeeringService    = wotServer.PeeringService;
  var SyncService       = wotServer.SyncService;
  var ContractService   = wotServer.ContractService;

  // Models
  var Peer       = wotServer.conn.model('Peer');
  var Forward    = wotServer.conn.model('Forward');
  var Membership = wotServer.conn.model('Membership');
  var PublicKey  = wotServer.conn.model('PublicKey');
  var Merkle     = wotServer.conn.model('Merkle');
  var Key        = wotServer.conn.model('Key');

  this.parseMembership = function (req, res) {
    var onError = http400(res);
    http2raw.membership(req, onError)
      .pipe(unix2dos())
      .pipe(parsers.parseMembership(onError))
      .pipe(versionFilter(onError))
      .pipe(currencyFilter(conf.currency, onError))
      .pipe(extractSignature(onError))
      .pipe(link2pubkey(wotServer.PublicKeyService, onError))
      .pipe(verifySignature(onError))
      .pipe(wotServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };

  this.parseKeyblock = function (req, res) {
    res.end(503);
  }

  this.current = function (req, res) {
    res.end(503);
  }
}
