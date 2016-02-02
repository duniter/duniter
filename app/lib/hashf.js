"use strict";

module.exports = function (str){
  return require("crypto")
    .createHash("sha256")
    .update(str)
    .digest("hex");
};
