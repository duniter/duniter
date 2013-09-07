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
  pgppasswd: String
});

ConfigurationSchema.methods = {
};

var Configuration = mongoose.model('Configuration', ConfigurationSchema);
