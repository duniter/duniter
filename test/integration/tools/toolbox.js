"use strict";

const _        = require('underscore');
const rp       = require('request-promise');
const httpTest = require('../tools/http');
const sync     = require('../tools/sync');
const commit   = require('../tools/commit');
const duniter  = require('../../../index');

const MEMORY_MODE = true;
const CURRENCY_NAME = 'duniter_unit_test_currency';
const HOST = '127.0.0.1';
let PORT = 10000;

module.exports = {

  /**
   * Creates a new memory duniter server for Unit Test purposes.
   * @param conf
   */
  server: (conf) => {
    const port = PORT++;
    const commonConf = {
      port: port,
      ipv4: HOST,
      remoteipv4: HOST,
      currency: CURRENCY_NAME,
      httpLogs: true,
      forksize: 3,
      parcatipate: false, // TODO: to remove when startGeneration will be an explicit call
      sigQty: 1
    };
    const server = duniter({
      memory: MEMORY_MODE,
      name: 'unit_test_currency'
    }, _.extend(conf, commonConf));

    server.port = port;
    server.host = HOST;

    server.url = (uri) => 'http://' + [HOST, port].join(':') + uri;
    server.get = (uri) => rp(server.url(uri), { json: true });
    server.post = (uri, obj) => rp(server.url(uri), { method: 'POST', json: true, body: obj });

    server.expect = (uri, expectations) => typeof expectations == 'function' ? httpTest.expectAnswer(rp(server.url(uri), { json: true }), expectations) : httpTest.expectJSON(rp(server.url(uri), { json: true }), expectations);
    server.expectThat = (uri, expectations) => httpTest.expectAnswer(rp(server.url(uri), { json: true }), expectations);
    server.expectJSON = (uri, expectations) => httpTest.expectJSON(rp(server.url(uri), { json: true }), expectations);

    server.syncFrom = (otherServer, fromIncuded, toIncluded) => sync(fromIncuded, toIncluded, otherServer, server);

    server.commit = (options) => commit(server)(options);

    return server;
  }
};
