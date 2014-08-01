var async            = require('async');
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

module.exports = function (hdcServer) {
  return new AmendmentBinding(hdcServer);
};

function AmendmentBinding (hdcServer) {

  var conf = hdcServer.conf;

  // Services
  var ParametersService = hdcServer.ParametersService;

  // Models
  var Amendment = hdcServer.conn.model('Amendment');
  var Merkle    = hdcServer.conn.model('Merkle');

  this.promotedNumber = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getAmendmentNumber(req, next);
      }
    ], function (err, number) {
      if(err){
        res.send(400, err);
        return;
      }
      async.waterfall([
        function (callback){
          Amendment.findPromotedByNumber(number, callback);
        }
      ], function (err, current) {
        showAmendment(res, current);
      });
    });
  };
}

function showAmendment (res, current) {
  if(!current){
    res.send(404, 'No amendment yet promoted');
    return;
  }
  res.setHeader("Content-Type", "text/plain");
  res.send(JSON.stringify(current.json(), null, "  "));
}
