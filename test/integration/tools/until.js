"use strict";

var UNTIL_TIMEOUT = 115000;

module.exports = function (server, eventName, count) {
  var counted = 0;
  var max = count == undefined ? 1 : count;
  return new Promise(function (resolve, reject) {
    var finished = false;
    server.on(eventName, function () {
      counted++;
      if (counted == max) {
        if (!finished) {
          finished = true;
          resolve();
        }
      }
    });
    setTimeout(function() {
      if (!finished) {
        finished = true;
        reject('Received ' + counted + '/' + count + ' ' + eventName + ' after ' + UNTIL_TIMEOUT + ' ms');
      }
    }, UNTIL_TIMEOUT);
  });
};
