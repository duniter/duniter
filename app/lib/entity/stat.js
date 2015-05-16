"use strict";
var _ = require('underscore');

var Stat = function(json) {

  var that = this;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });

  this.json = function () {
    return { "blocks": this.blocks };
  };
};

module.exports = Stat;
