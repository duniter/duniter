"use strict";

const co = require('co');

module.exports = {
  duniter: {
    cli: [{
      name: 'sync [host] [port] [to]',
      desc: 'Synchronize blockchain from a remote Duniter node',
      onPluggedDALExecute: (server, conf, program, params) => co(function*() {
        const host = params[0];
        const port = params[1];
        const to   = params[2];
        if (!host) {
          throw 'Host is required.';
        }
        if (!port) {
          throw 'Port is required.';
        }
        let cautious;
        if (program.nocautious) {
          cautious = false;
        }
        if (program.cautious) {
          cautious = true;
        }
        yield server.synchronize(host, port, parseInt(to), 0, !program.nointeractive, cautious, program.nopeers, program.noshuffle);
        if (server) {
          yield server.disconnect();
        }
      })
    }]
  }
}
