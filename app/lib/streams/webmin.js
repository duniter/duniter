"use strict";

var co = require('co');
var es = require('event-stream');
var network = require('../../lib/network');
var dtos = require('../../lib/streams/dtos');

let WebSocketServer = require('ws').Server;

module.exports = function(dbConf, overConf, interfaces, httpLogs) {

  var webminCtrl = require('../../controllers/webmin.controller')(dbConf, overConf);

  return network.createServersAndListen('uCoin web admin', interfaces, httpLogs, (app, httpMethods) => {

    httpMethods.httpGET(  '/webmin/summary',                   webminCtrl.summary, dtos.AdminSummary);
    httpMethods.httpGET(  '/webmin/server/http/start',         webminCtrl.startHTTP, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/http/stop',          webminCtrl.stopHTTP,  dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/preview_next',       webminCtrl.previewNext,  dtos.Block);
    httpMethods.httpPOST( '/webmin/server/send_conf',          webminCtrl.sendConf, dtos.Identity);
    httpMethods.httpPOST( '/webmin/server/start_sync',         webminCtrl.startSync, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/auto_conf_network',  webminCtrl.autoConfNetwork, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/services/start_all', webminCtrl.startAllServices, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/services/stop_all',  webminCtrl.stopAllServices, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/network/interfaces',        webminCtrl.listInterfaces, dtos.NetworkInterfaces);
  }, (httpServer) => {

    // Socket for synchronization events
    let wssEvents = new WebSocketServer({
      server: httpServer,
      path: '/webmin/ws'
    });

    //wssSync.on('connection', function connection() {
    //  wssSync.broadcast(JSON.stringify({
    //    type: 'download',
    //    value: 55
    //  }));
    //});

    wssEvents.broadcast = (data) => wssEvents.clients.forEach((client) => client.send(data));

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
            value: data.sync
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
};
