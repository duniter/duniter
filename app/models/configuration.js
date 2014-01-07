var mongoose = require('mongoose');
var Schema   = mongoose.Schema;

var ConfigurationSchema = new Schema({
  port: {"type": Number, "default": 0},
  ipv4: String,
  ipv6: String,
  remotehost: String,
  remoteipv4: String,
  remoteipv6: String,
  remoteport: Number,
  pgpkey: String,
  pgppasswd: String,
  kmanagement: String,
  kaccept: String
});

ConfigurationSchema.pre('save', function (next) {
  if(!this.kmanagement || !this.kmanagement.match(/^(ALL|KEYS)$/)){
    console.error('Incorrect --kmanagement value, reset to default `KEYS` value');
    this.kmanagement = 'KEYS';
  }
  if(!this.kaccept || !this.kaccept.match(/^(ALL|KEYS)$/)){
    console.error('Incorrect --kaccept value, reset to default `KEYS` value');
    this.kaccept = 'KEYS';
  }
  this.updated = Date.now();
  next();
});

var Configuration = mongoose.model('Configuration', ConfigurationSchema);
