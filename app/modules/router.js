"use strict";

const co = require('co');
const constants = require('../lib/constants');
const util = require('util');
const stream = require('stream');
const router = require('../lib/streams/router');
const multicaster = require('../lib/streams/multicaster');

module.exports = {
  duniter: {
    service: {
      output: (server, conf, logger) => new Router(server, conf, logger)
    },
    methods: {
      routeToNetwork: (server) => {
        const router = new Router(server);
        router.startService();
        server.pipe(router);
      }
    }
  }
}

/**
 * Service which triggers the server's peering generation (actualization of the Peer document).
 * @constructor
 */
function Router(server) {

  const that = this;
  let theRouter, theMulticaster = multicaster();

  stream.Transform.call(this, { objectMode: true });

  this._write = function (obj, enc, done) {
    // Never close the stream
    if (obj) {
      that.push(obj);
    }
    done && done();
  };

  this.startService = () => co(function*() {
    if (!theRouter) {
      theRouter = router(server.PeeringService, server.dal);
    }
    theRouter.setActive(true);
    theRouter.setConfDAL(server.dal);

    /**
     * Enable routing features:
     *   - The server will try to send documents to the network
     *   - The server will eventually be notified of network failures
     */
    // The router asks for multicasting of documents
    that
      .pipe(theRouter)
    // The documents get sent to peers
      .pipe(theMulticaster)
      // The multicaster may answer 'unreachable peer'
      .pipe(theRouter);
  });

  this.stopService = () => co(function*() {
    that.unpipe();
    theRouter && theRouter.unpipe();
    theMulticaster && theMulticaster.unpipe();
  });
}

util.inherits(Router, stream.Transform);
