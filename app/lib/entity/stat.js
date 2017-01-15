"use strict";
const _ = require('underscore');

const Stat = function(json) {
  _(json).keys().forEach((key) => {
    this[key] = json[key];
  });

  this.json = function () {
    return { "blocks": this.blocks };
  };
};

module.exports = Stat;
