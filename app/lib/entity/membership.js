var _ = require('underscore');
var moment = require('moment');

var Membership = function(json) {

  var that = this;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });
};

Membership.statics = {};

Membership.statics.fromInline = function (inlineMS, type, currency) {
  var sp = inlineMS.split(':');
  return new Membership({
    version:    1,
    currency:   currency,
    issuer:     sp[0],
    membership: type,
    type:       type,
    number:     parseInt(sp[2]),
    fpr:        sp[3],
    block:      [sp[2], sp[3]].join('-'),
    certts:     new Date(parseInt(sp[4])*1000),
    userid:     sp[5],
    signature:  sp[1]
  });
};

Membership.statics.toInline = function (entity) {
  return [entity.issuer, entity.signature, entity.number, entity.fpr, moment(entity.certts).unix(), entity.userid].join(':');
};

module.exports = Membership;
