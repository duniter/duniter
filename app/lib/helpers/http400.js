"use strict";
const logger = require('../logger')('http');

module.exports = function http400 (res) {
  return function (err) {
    logger.warn(err);
    res.send(400, err);
  };
}
