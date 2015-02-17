"use strict";
var layouts = require('log4js').layouts;
var logFunc = function(l) {
  console.log(l);
};

function arrayAppender (layout) {
  layout = layout || layouts.basicLayout;
  return function(loggingEvent) {
    logFunc(layout(loggingEvent));
  };
}

function configure(config) {
  var layout;
  if (config.layout) {
    layout = layouts.layout(config.layout.type, config.layout);
  }
  if (config.options.output) {
    logFunc = config.options.output;
  }
  return arrayAppender(layout);
}

exports.appender = arrayAppender;
exports.configure = configure;