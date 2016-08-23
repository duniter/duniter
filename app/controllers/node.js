"use strict";

const co = require('co');

module.exports = function (server) {
  return new NodeBinding(server);
};

function NodeBinding (server) {

  this.summary = () => {
    return {
      "duniter": {
        "software": "duniter",
        "version": server.version,
        "forkWindowSize": server.conf.forksize
      }
    };
  };

  this.sandboxes = () => co(function*() {
    return {
      identities: yield sandboxIt(server.dal.idtyDAL.sandbox),
      certifications: yield sandboxIt(server.dal.certDAL.sandbox),
      memberships: yield sandboxIt(server.dal.msDAL.sandbox),
      transactions: yield sandboxIt(server.dal.txsDAL.sandbox)
    };
  });
}

function sandboxIt(sandbox) {
  return co(function*() {
    return {
      size: sandbox.maxSize,
      free: yield sandbox.getSandboxRoom()
    };
  });
}
