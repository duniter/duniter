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
        "forkWindowSize": server.conf.forksize
      }
    }, null, "  "));
  };
}
