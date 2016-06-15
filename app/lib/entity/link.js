"use strict";
const _ = require('underscore');

module.exports = Link;

function Link(json) {

  _(json || {}).keys().forEach((key) => {
    let value = json[key];
    if (key == "number") {
      value = parseInt(value);
    }
    this[key] = value;
  });
}