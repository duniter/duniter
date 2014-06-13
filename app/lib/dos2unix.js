module.exports = function dos2unix(str){
  return str.replace(/\r\n/g, '\n');
};
