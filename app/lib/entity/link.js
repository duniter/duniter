var _ = require('underscore');

module.exports = Link;

function Link(json) {

  var that = this;

  _(json || {}).keys().forEach(function(key) {
    var value = json[key];
    if (key == "number") {
      value = parseInt(value);
    }
    that[key] = value;
  });
}