var async    = require('async');
var sha1     = require('sha1');
var util     = require('util');
var stream   = require('stream');

module.exports = function (server) {
  return new Router(server);
};

function Router (server) {

  stream.Writable.call(this, { objectMode: true });

  var that = this;

  this._write = function (obj, enc, done) {
    if (typeof obj.email != undefined) {
      getRandomInAllPeers(function (err, peers) {
        that.emit('pubkey', pubkey, peers || []);
      });
    }
  };

  function getRandomInAllPeers (done) {
    Peer.getRandomlyWithout([server.PeeringService.cert.fingerprint], done);
  };
};

util.inherits(Router, stream.Writable);
