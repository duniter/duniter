"use strict";
var layouts = require('log4js').layouts;
var output = [];

function arrayAppender (layout) {
  layout = layout || layouts.basicLayout;
  return function(loggingEvent) {
    output.push(layout(loggingEvent));
  };
}

function configure(config) {
  var layout;
  if (config.layout) {
    layout = layouts.layout(config.layout.type, config.layout);
  }
  if (config.options.output) {
    output = config.options.output;
  }
  return arrayAppender(layout);
}

exports.appender = arrayAppender;
exports.configure = configure;