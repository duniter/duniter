
"use strict";
const co = require('co');
const dos2unix = require('../lib/system/dos2unix');

module.exports = function AbstractController (server) {

  const logger = require('../lib/logger')('abstractController');

  this.pushEntity = (req, rawer, type) => co(function *() {
    let rawDocument = rawer(req);
    rawDocument = dos2unix(rawDocument);
    const written = yield server.writeRaw(rawDocument, type);
    try {
      return written.json();
    } catch (e) {
      logger.error('Written:', written);
      logger.error(e);
      throw e;
    }
  });
};
