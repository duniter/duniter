"use strict";

const path = require('path');
const routes = require('./routes');
const network = require('../system/network');
const dtos = require('../../lib/streams/dtos');

const ENABLE_FILE_UPLOAD = true;

let WebSocketServer = require('ws').Server;

module.exports = function(dbConf, overConf, interfaces, httpLogs) {

  const webminCtrl = require('../../controllers/webmin.controller')(dbConf, overConf);

  const fullPath = path.join(__dirname, '../../../web-ui/public');

  let httpLayer = network.createServersAndListen('Duniter web admin', interfaces, httpLogs, fullPath, (app, httpMethods) => {

    routes.bma(webminCtrl.server, '/bma', app, httpMethods);
    routes.webmin(webminCtrl, app, httpMethods);

  }, (httpServer) => {
    routes.bmaWS(webminCtrl.server, '/bma')(httpServer);
    routes.webminWS(webminCtrl)(httpServer);
  }, ENABLE_FILE_UPLOAD);

  return {
    httpLayer: httpLayer,
    webminCtrl: webminCtrl
  };
};
