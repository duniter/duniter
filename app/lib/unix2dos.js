var dos2unix = require('./dos2unix');
module.exports = function unix2dos(str){
  return dos2unix(str).replace(/\n/g, '\r\n');
};
