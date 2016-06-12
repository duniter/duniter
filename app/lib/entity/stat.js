"use strict";
let _ = require('underscore');

let Stat = function(json) {
  _(json).keys().forEach((key) => {
   this[key] = json[key];
  });

  this.json = function () {
    return { "blocks": this.blocks };
  };
};

module.exports = Stat;
