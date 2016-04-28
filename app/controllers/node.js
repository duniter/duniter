"use strict";

module.exports = function (server) {
  return new NodeBinding(server);
};

function NodeBinding (server) {

  this.summary = () => {
    return {
      "ucoin": {
        "software": "duniter",
        "version": server.version,
        "forkWindowSize": server.conf.forksize
      }
    };
  };
}
