// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

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
