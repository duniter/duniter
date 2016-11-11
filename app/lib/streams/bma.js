"use strict";

const network = require('../system/network');
const routes = require('./routes');

module.exports = function(server, interfaces, httpLogs) {

  if (!interfaces) {
    interfaces = [];
    if (server.conf) {
      if (server.conf.ipv4) {
        interfaces = [{
          ip: server.conf.ipv4,
          port: server.conf.port
        }];
      }
      if (server.conf.ipv6) {
        interfaces.push({
          ip: server.conf.ipv6,
          port: (server.conf.remoteport || server.conf.port) // We try to get the best one
        });
      }
    }
  }

  return network.createServersAndListen('Duniter server', interfaces, httpLogs, null, (app, httpMethods) => {
    
    routes.bma(server, '', app, httpMethods);

  }, routes.bmaWS(server, ''));
};
