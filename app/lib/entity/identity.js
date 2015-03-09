var _ = require('underscore');
var moment = require('moment');

var Identity = function(json) {

  var that = this;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });
};

Identity.statics = {};

Identity.statics.fromInline = function (inline) {
  var sp = inline.split(':');
  return new Identity({
    pubkey: sp[0],
    sig: sp[1],
    time: new Date(parseInt(sp[2])*1000),
    uid: sp[3]
  });
};

Identity.statics.toInline = function (entity) {
  return [entity.pubkey, entity.sig, moment(entity.time).unix(), entity.uid].join(':');
};

module.exports = Identity;
