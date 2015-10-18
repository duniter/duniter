"use strict";

var co = require('co');

module.exports = function (server) {
  return new NodeBinding(server);
};

function NodeBinding (server) {

  this.summary = function (req, res) {
    res.type('application/json');
    res.send(200, JSON.stringify({
      "ucoin": {
        "software": "ucoind",
        "version": server.version,
        "forkWindowSize": server.conf.branchesWindowSize
      }
    }, null, "  "));
  };

  this.dumpDB = function (req, res) {
    res.type('application/json');
    co(function *() {
      let dal = server.BlockchainService.getMainContext().dal;
      let dump = yield dal.dumpDB();
      res.send(200, JSON.stringify({
        "dump": dump
      }, null, "  "));
    })
    .catch(function(){
      res.send(500, 'Could not generate DB dump');
    });
  };
}
