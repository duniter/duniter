"use strict";

var Server = require('./server');

module.exports = function (dbConf, overConf) {
  return new Server(dbConf, overConf);
};
