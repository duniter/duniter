"use strict";

var network = require('../../lib/network');
var dtos = require('../../lib/streams/dtos');

module.exports = function(dbConf, overConf, interfaces, httpLogs) {

  return network.createServersAndListen('uCoin web admin', interfaces, httpLogs, (app, httpMethods) => {

    var webminCtrl = require('../../controllers/webmin.controller')(dbConf, overConf);
    httpMethods.httpGET(  '/webmin/summary',                   webminCtrl.summary, dtos.AdminSummary);
    httpMethods.httpGET(  '/webmin/server/http/start',         webminCtrl.startHTTP, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/http/stop',          webminCtrl.stopHTTP,  dtos.Boolean);
    httpMethods.httpGET(  '/webmin/server/preview_next',       webminCtrl.previewNext,  dtos.Block);
    httpMethods.httpPOST( '/webmin/server/send_conf',          webminCtrl.sendConf, dtos.Identity);
    httpMethods.httpGET(  '/webmin/server/services/start_all', webminCtrl.startAllServices, dtos.Boolean);
    httpMethods.httpGET(  '/webmin/network/interfaces',        webminCtrl.listInterfaces, dtos.NetworkInterfaces);
  });
};
