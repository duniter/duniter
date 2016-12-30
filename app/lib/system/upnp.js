const upnp = require('nnupnp');
const async = require('async');
const constants  = require('../constants');
const logger = require('../logger')('upnp');
const co = require('co');
const Q = require('q');

module.exports = function (localPort, remotePort) {
  "use strict";
  return co(function *() {
    logger.info('UPnP: configuring...');
    return co(function *() {
      try {
        yield openPort(localPort, remotePort);
      } catch (e) {
        const client = upnp.createClient();
        try {
          yield Q.nbind(client.externalIp, client)();
        } catch (err) {
          if (err && err.message == 'timeout') {
            throw 'No UPnP gateway found: your node won\'t be reachable from the Internet. Use --noupnp option to avoid this message.'
          }
          throw err;
        } finally {
          client.close();
        }
      }
      let interval, upnpService = {
        openPort: () => {
          return openPort(localPort, remotePort);
        },
        startRegular: () => {
          upnpService.stopRegular();
          // Update UPnP IGD every INTERVAL seconds
          interval = setInterval(async.apply(openPort, localPort, remotePort), 1000 * constants.NETWORK.UPNP.INTERVAL);
        },
        stopRegular: () => {
          if (interval) {
            clearInterval(interval);
          }
        }
      };
      return upnpService;
    });
  });
};

function openPort (localPort, remotePort) {
  "use strict";
  return Q.Promise(function(resolve, reject){
    logger.trace('UPnP: mapping external port %s to local %s...', remotePort, localPort);
    const client = upnp.createClient();
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