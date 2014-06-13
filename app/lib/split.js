module.exports = function (pattern) {
  return function (str) {
    return str.split(pattern);
  };
};
