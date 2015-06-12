var upnp = require('nat-upnp');
var async = require('async');
var constants  = require('../lib/constants');
var logger = require('../lib/logger')('upnp');

module.exports = function (localPort, remotePort, done) {
  "use strict";
  logger.info('Configuring UPnP...');
  var client = upnp.createClient();
  async.waterfall([
    function (next) {
      client.externalIp(function(err, ip) {
        if (err && err.message == 'timeout') {
          err = 'No UPnP gateway found: your node won\'t be reachable from the Internet. Use --noupnp option to avoid this message.';
        }
        next(err, ip);
      });
    },
    function (ip, next) {
      client.close();
      // Update UPnP IGD every INTERVAL seconds
      setInterval(async.apply(openPort, localPort, remotePort), 1000 * constants.NETWORK.UPNP.INTERVAL);
      openPort(localPort, remotePort, next);
    }
  ], done);
};

function openPort (localPort, remotePort, done) {
  "use strict";
  var client = upnp.createClient();
  client.portMapping({
    public: parseInt(remotePort),
    private: parseInt(localPort),
    ttl: constants.NETWORK.UPNP.TTL
  }, function(err) {
    client.close();
    return done && done(err);
  });
}