
"use strict";
var co = require('co');
var dos2unix = require('../lib/dos2unix');

module.exports = function AbstractController (server) {

  this.pushEntity = (req, rawer, parser) => co(function *() {
    let rawDocument = rawer(req);
    rawDocument = dos2unix(rawDocument);
    let obj = parser.syncWrite(rawDocument);
    let written = yield server.singleWritePromise(obj);
    return written.json();
  });
};
