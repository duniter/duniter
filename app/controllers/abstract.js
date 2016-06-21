
"use strict";
const co = require('co');
const dos2unix = require('../lib/system/dos2unix');

module.exports = function AbstractController (server) {

  this.pushEntity = (req, rawer, type) => co(function *() {
    let rawDocument = rawer(req);
    rawDocument = dos2unix(rawDocument);
    const written = yield server.writeRaw(rawDocument, type);
    return written.json();
  });
};
