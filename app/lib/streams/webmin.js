"use strict";

var path = require('path');
var es = require('event-stream');
var constants = require('../../lib/constants');
var network = require('../../lib/network');
var dtos = require('../../lib/streams/dtos');
var logger = require('../../lib/logger')('webmin');

let WebSocketServer = require('ws').Server;

module.exports = function(dbConf, overConf, interfaces, httpLogs) {

  var webminCtrl = require('../../controllers/webmin.controller')(dbConf, overConf);

  var fullPath = path.join(__dirname, '../../../web-ui/public');

  let httpLayer = network.createServersAndListen('Duniter web admin', interfaces, httpLogs, fullPath, (app, httpMethods) => {

    httpMethods.httpGET(  '/webmin/summary',                   webminCtrl.summary, dtos.AdminSummary);
    httpMethods.httpPOST( '/webmin/key/preview',               webminCtrl.previewPubkey, dtos.PreviewPubkey);
    httpMethods.httpGET(  '/webmin/server/http/start',         webminCtrl.startHTTP, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/http/stop',          webminCtrl.stopHTTP,  dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/http/upnp/open',     webminCtrl.openUPnP,  dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/http/upnp/regular',  webminCtrl.regularUPnP,  dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/preview_next',       webminCtrl.previewNext,  dtos.Block);
    httpMethods.httpPOST( '/webmin/server/send_conf',          webminCtrl.sendConf, dtos.Identity);
    httpMethods.httpPOST( '/webmin/server/net_conf',           webminCtrl.applyNetworkConf, dtos.Boolean);
    httpMethods.httpPOST( '/webmin/server/key_conf',           webminCtrl.applyNewKeyConf, dtos.Boolean);
    httpMethods.httpPOST( '/webmin/server/start_sync',         webminCtrl.startSync, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/auto_conf_network',  webminCtrl.autoConfNetwork, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/services/start_all', webminCtrl.startAllServices, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/services/stop_all',  webminCtrl.stopAllServices, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/reset/data',         webminCtrl.resetData, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/network/interfaces',        webminCtrl.listInterfaces, dtos.NetworkInterfaces);
  }, (httpServer) => {

    // Socket for synchronization events
    let wssEvents = new WebSocketServer({
      server: httpServer,
      path: '/webmin/ws'
    });

    let lastLogs = [];
    wssEvents.on('connection', function connection(ws) {

      ws.on('message', () => {
        wssEvents.broadcast(JSON.stringify({
          type: 'log',
          value: lastLogs
        }));
      });

      wssEvents.broadcast(JSON.stringify({
        type: 'log',
        value: lastLogs
      }));

      // The callback which write each new log message to websocket
      logger.addCallbackLogs((level, msg, timestamp) => {
        lastLogs.splice(0, Math.max(0, lastLogs.length - constants.WEBMIN_LOGS_CACHE + 1));
        lastLogs.push({
          timestamp: timestamp,
          level: level,
          msg: msg
        });
        wssEvents.broadcast(JSON.stringify({
          type: 'log',
          value: [{
            timestamp: timestamp,
            level: level,
            msg: msg
          }]
        }));
      });
    });

    wssEvents.broadcast = (data) => wssEvents.clients.forEach((client) => {
      try {
        client.send(data);
      } catch (e) {
        console.log(e);
      }
    });

    // Forward blocks & peers
    webminCtrl
      .pipe(es.mapSync(function(data) {
        // Broadcast block
        if (data.download !== undefined) {
          wssEvents.broadcast(JSON.stringify({
            type: 'download',
            value: data.download
          }));
        }
        if (data.applied !== undefined) {
          wssEvents.broadcast(JSON.stringify({
            type: 'applied',
            value: data.applied
          }));
        }
        if (data.sync !== undefined) {
          wssEvents.broadcast(JSON.stringify({
            type: 'sync',
            value: data.sync,
            msg: (data.msg && (data.msg.message || data.msg))
          }));
        }
        if (data.started !== undefined) {
          wssEvents.broadcast(JSON.stringify({
            type: 'started',
            value: data.started
          }));
        }
        if (data.stopped !== undefined) {
          wssEvents.broadcast(JSON.stringify({
            type: 'stopped',
            value: data.stopped
          }));
        }
      }));
  });

  return {
    httpLayer: httpLayer,
    webminCtrl: webminCtrl
  };
};
