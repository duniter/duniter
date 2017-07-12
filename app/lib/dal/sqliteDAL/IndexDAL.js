"use strict";

const AbstractSQLite = require('./AbstractSQLite')
const AbstractIndex = require('./AbstractIndex')

module.exports = function IndexDAL(driver) {

  AbstractSQLite.call(this, driver);
  AbstractIndex.call(this);
}
