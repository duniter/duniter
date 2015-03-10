var _ = require('underscore');

var Certification = function(json) {

  var that = this;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });
};

Certification.statics = {};

Certification.statics.fromInline = function (inline) {
  var sp = inline.split(':');
  return new Certification({
    pubkey: sp[0],
    to: sp[1],
    block_number: parseInt(sp[2]),
    sig: sp[3]
  });
};

Certification.statics.toInline = function (entity, certificationModel) {
  if (certificationModel) {
    var model = new certificationModel();
    _(model.aliases).keys().forEach(function(aliasKey){
      var alias = model.aliases[aliasKey];
      entity[aliasKey] = entity[alias];
    });
  }
  return [entity.pubkey, entity.to, entity.block_number, entity.sig].join(':');
};

module.exports = Certification;
