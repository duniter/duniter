var mongoose = require('mongoose');
var Schema   = mongoose.Schema;

var ConfigurationSchema = new Schema({
  port: {"type": Number, "default": 0},
  ipv4: String,
  ipv6: String,
  pgpkey: String,
  pgppasswd: String
});

ConfigurationSchema.methods = {
};

var Configuration = mongoose.model('Configuration', ConfigurationSchema);
