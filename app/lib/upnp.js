var upnp = require('nat-upnp');
var async = require('async');
var constants  = require('../lib/constants');
var logger = require('../lib/logger')('upnp');
var co = require('co');
var Q = require('q');

module.exports = function (localPort, remotePort) {
  "use strict";
  return co(function *() {
    logger.info('UPnP: configuring...');
    // Update UPnP IGD every INTERVAL seconds
    setInterval(async.apply(openPort, localPort, remotePort), 1000 * constants.NETWORK.UPNP.INTERVAL);
    return openPort(localPort, remotePort)
      .catch(function(){
        var client = upnp.createClient();
        return Q.nbind(client.externalIp, client)()
          .catch(function(err){
            if (err && err.message == 'timeout') {
              throw 'No UPnP gateway found: your node won\'t be reachable from the Internet. Use --noupnp option to avoid this message.'
            }
            throw err;
          })
          .finally(function() {
            client.close();
          });
      });
  });
};

function openPort (localPort, remotePort) {
  "use strict";
  return Q.Promise(function(resolve, reject){
    logger.info('UPnP: mapping external port %s to local %s...', remotePort, localPort);
    var client = upnp.createClient();
    client.portMapping({
      'public': parseInt(remotePort),
      'private': parseInt(localPort),
      'ttl': constants.NETWORK.UPNP.TTL
    }, function(err) {
      client.close();
      if (err) {
        logger.warn(err);
        return reject(err);
      }
      resolve();
    });
  });
}