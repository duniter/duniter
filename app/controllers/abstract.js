
"use strict";
var co = require('co');
var dos2unix = require('../lib/system/dos2unix');

module.exports = function AbstractController (server) {

  this.pushEntity = (req, rawer, type) => co(function *() {
    let rawDocument = rawer(req);
    rawDocument = dos2unix(rawDocument);
    let written = yield server.writeRaw(rawDocument, type);
    return written.json();
  });
};
