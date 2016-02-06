/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');
var co = require('co');
var colors = require('colors');
var logger = require('../../../../app/lib/logger')('sqlite');

module.exports = AbstractSQLite;

function AbstractSQLite(db) {

  "use strict";

  let that = this;

  this.ASC = false;
  this.DESC = true;
  this.arrays = [];
  this.booleans = [];
  this.bigintegers = [];
  this.translated = {};

  this.query = (sql, params) => co(function *() {
    try {
      //logger.trace(sql, JSON.stringify(params || []));
      let start = new Date();
      let res = yield Q.nbind(db.all, db)(sql, params || []);
      let duration = (new Date()) - start;
      let entities = res.map(toEntity);
      // Display result
      let msg = sql + ' | %s\t==> %s rows in %s ms';
      if (duration <= 2) {
        msg = colors.green(msg);
      } else if(duration <= 5) {
        msg = colors.yellow(msg);
      } else if (duration <= 10) {
        msg = colors.magenta(msg);
      } else if (duration <= 100) {
        msg = colors.red(msg);
      }
      logger.query(msg, JSON.stringify(params || []), entities.length, duration);
      return entities;
    } catch (e) {
      console.error('ERROR >> %s', sql, JSON.stringify(params || []), e.stack || e.message || e);
      throw e;
    }
  });

  this.sqlListAll = () => this.query("SELECT * FROM " + this.table);

  this.sqlDeleteAll = () => this.exec("DELETE FROM " + this.table);

  this.sqlFind = (obj, sortObj) => co(function *() {
    let conditions = toConditionsArray(obj).join(' and ');
    let values = toParams(obj);
    let sortKeys = _.keys(sortObj);
    let sort = sortKeys.length ? ' ORDER BY ' + sortKeys.map((k) => "`" + k + "` " + (sortObj[k] ? 'DESC' : 'ASC')).join(',') : '';
    return that.query('SELECT * FROM ' + that.table + ' WHERE ' + conditions + sort, values);
  });

  this.sqlFindOne = (obj) => co(function *() {
    let res = yield that.sqlFind(obj);
    return res[0];
  });

  this.sqlFindLikeAny = (obj, sort) => co(function *() {
    let keys = _.keys(obj);
    return that.query('SELECT * FROM ' + that.table + ' WHERE ' + keys.map((k) => '`' + k + '` like ?').join(' or '), keys.map((k) => obj[k].toUpperCase()), sort);
  });

  this.sqlUpdateWhere = (obj, where) => co(function *() {
    // Valorizations
    let setInstructions = toSetArray(obj).join(', ');
    let setValues = toParams(obj);
    // Conditions
    let conditions = toConditionsArray(where).join(' AND ');
    let condValues = toParams(where);
    return that.query('UPDATE ' + that.table + ' SET ' + setInstructions + ' WHERE ' + conditions, setValues.concat(condValues));
  });

  this.sqlRemoveWhere = (obj) => co(function *() {
    let keys = _.keys(obj);
    return that.query('DELETE FROM ' + that.table + ' WHERE ' + keys.map((k) => '`' + k + '` = ?').join(' and '), keys.map((k) => obj[k]));
  });

  this.sqlExisting = (entity) => that.getEntity(entity);

  this.saveEntity = (entity) => co(function *() {
    let toSave = entity;
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    let existing = yield that.getEntity(toSave);
    if (existing) {
      toSave = toRow(toSave);
      let valorizations = that.fields.map((field) => '`' + field + '` = ?').join(', ');
      let conditions = getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
      let setValues = that.fields.map((field) => toSave[field]);
      let condValues = getPKFields().map((k) => toSave[k]);
      return that.query('UPDATE ' + that.table + ' SET ' + valorizations + ' WHERE ' + conditions, setValues.concat(condValues));
    }
    yield that.insert(toSave);
  });

  this.updateEntity = (entity, values) => co(function *() {
    let toSave = toRow(entity);
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    let valuesKeys = _.keys(values);
    let valorizations = valuesKeys.map((field) => '`' + field + '` = ?').join(', ');
    let conditions = getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
    let setValues = valuesKeys.map((field) => values[field]);
    let condValues = getPKFields().map((k) => toSave[k]);
    return that.query('UPDATE ' + that.table + ' SET ' + valorizations + ' WHERE ' + conditions, setValues.concat(condValues));
  });

  this.deleteEntity = (entity) => co(function *() {
    let toSave = toRow(entity);
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    let conditions = getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
    let condValues = getPKFields().map((k) => toSave[k]);
    return that.query('DELETE FROM ' + that.table + ' WHERE ' + conditions, condValues);
  });

  this.insert = (entity) => co(function *() {
    let row = toRow(entity);
    let values = that.fields.map((f) => row[f]);
    yield that.query(that.getInsertQuery(), values);
  });

  this.getEntity = function(entity) {
    return co(function *() {
      let conditions = getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
      let params = toParams(entity, getPKFields());
      return (yield that.query('SELECT * FROM ' + that.table + ' WHERE ' + conditions, params))[0];
    });
  };

  this.exec = (sql) => co(function *() {
    try {
      if (sql.match(/INSERT INTO source/)) {
        //console.log('------------');
        //console.log(sql);
        //console.log('------------');
      }
      return Q.nbind(db.exec, db)(sql);
    } catch (e) {
      console.error('ERROR >> %s', sql);
      throw e;
    }
  });

  this.getInsertQuery = () =>
    "INSERT INTO " + that.table + " (" + getFields(that.fields).map(f => '`' + f + '`').join(',') + ") VALUES (" + "?,".repeat(that.fields.length - 1) + "?);";

  this.getInsertHead = () => {
    let valuesKeys = getFields(that.fields);
    return 'INSERT INTO ' + that.table + " (" + valuesKeys.map(f => '`' + f + '`').join(',') + ") VALUES ";
  };

  this.getInsertValue = (toSave) => {
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    let row = toRow(toSave);
    let valuesKeys = getFields(that.fields);
    let values = valuesKeys.map((field) => escapeToSQLite(row[field]));
    return "(" + values.join(',') + ")";
  };

  this.getUpdateRawQuery = (toSave, values) => {
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    let valuesKeys = _.keys(values);
    let valorizations = valuesKeys.map((field) => '`' + field + '` = ' + escapeToSQLite(values[field])).join(', ');
    let conditions = getPKFields().map((field) => '`' + field + '` = ' + escapeToSQLite(toSave[field])).join(' and ');
    return 'UPDATE ' + that.table + ' SET ' + valorizations + ' WHERE ' + conditions + ';';
  };

  this.getDeleteRawQuery = (toSave) => {
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    let conditions = getPKFields().map((field) => '`' + field + '` = ' + escapeToSQLite(toSave[field])).join(' and ');
    return 'DELETE FROM ' + that.table + ' WHERE ' + conditions + ';';
  };

  this.getDeleteHead = () => {
    return 'DELETE FROM ' + that.table + " WHERE ";
  };

  this.getDeleteValues = (entities) => {
    return entities.map((toSave) => {
      if (that.beforeSaveHook) {
        that.beforeSaveHook(toSave);
      }
      let conditions = getPKFields().map((field) => '`' + field + '` = ' + escapeToSQLite(toSave[field])).join(' and ');
      return "(" + conditions + ")";
    }).join(' OR\n ');
  };

  this.toInsertValues = (entity) => {
    let row = toRow(entity);
    let values = that.fields.map((f) => row[f]);
    let formatted = values.map(escapeToSQLite);
    return "(" + formatted.join(',') + ")";
  };

  function toConditionsArray(obj) {
    return _.keys(obj).map((k) => {
      if (obj[k].$lte !== undefined) {
        return '`' + k + '` <= ?';
      } else if (obj[k].$gte !== undefined) {
        return '`' + k + '` >= ?';
      } else if (obj[k].$gt !== undefined) {
        return '`' + k + '` >= ?';
      }  else if (obj[k].$null !== undefined) {
        return '`' + k + '` IS ' + (!obj[k].$null ? 'NOT' : '') + ' NULL';
      }  else if (obj[k].$contains !== undefined) {
        return '`' + k + '` LIKE ?';
      } else {
        return '`' + k + '` = ?';
      }
    });
  }

  function toSetArray(obj) {
    let row = toRow(obj);
    return _.keys(row).map((k) => '`' + k + '` = ?');
  }

  function toParams(obj, fields) {
    let params = [];
    (fields || _.keys(obj)).forEach((f) => {
      if (obj[f].$null === undefined) {
        let pValue;
        if      (obj[f].$lte  !== undefined)      { pValue = obj[f].$lte;  }
        else if (obj[f].$gte  !== undefined)      { pValue = obj[f].$gte;  }
        else if (obj[f].$gt   !== undefined)      { pValue = obj[f].$gt;   }
        else if (obj[f].$null !== undefined)      { pValue = obj[f].$null; }
        else if (obj[f].$contains !== undefined) { pValue = "%" + obj[f].$contains + "%"; }
        else if (~that.bigintegers.indexOf(f) && typeof obj[f] !== "string") {
          pValue = String(obj[f]);
        } else {
          pValue = obj[f];
        }
        params.push(pValue);
      }
    });
    return params;
  }

  function escapeToSQLite(val) {
    if (typeof val == "boolean") {
      // SQLite specific: true => 1, false => 0
      return val ? 1 : 0;
    }
    else if (typeof val == "string") {
      return "'" + val.replace(/'/g, "\\'") + "'";
    }
    else if (val === undefined) {
      return "null";
    } else {
      return JSON.stringify(val);
    }
  }

  function getPKFields() {
    return getFields(that.pkFields);
  }

  function getFields(fields) {
    return fields.map((f) => getField(f));
  }

  function getField(f) {
    return that.translated[f] || f;
  }

  function toEntity(row) {
    for (let i = 0, len = that.arrays.length; i < len; i++) {
      let arr = that.arrays[i];
      row[arr] = JSON.parse(row[arr]);
    }
    // Big integers are stored as strings to avoid data loss
    for (let i = 0, len = that.bigintegers.length; i < len; i++) {
      let bigint = that.bigintegers[i];
      row[bigint] = parseInt(row[bigint], 10);
    }
    // Translate some DB fields to obj fields
    let toTranslate = that.translated || {};
    let toDBFields = _.keys(toTranslate);
    for (let i = 0, len = toDBFields.length; i < len; i++) {
      let objField = toDBFields[i];
      row[objField] = row[toTranslate[objField]];
    }
    // Booleans
    for (let i = 0, len = that.booleans.length; i < len; i++) {
      let f = that.booleans[i];
      row[f] = Boolean(row[f]);
    }
    return row;
  }

  function toRow(entity) {
    let row = _.clone(entity);
    for (let i = 0, len = that.arrays.length; i < len; i++) {
      let arr = that.arrays[i];
      row[arr] = JSON.stringify(row[arr] || []);
    }
    // Big integers are stored as strings to avoid data loss
    for (let i = 0, len = that.bigintegers.length; i < len; i++) {
      let bigint = that.bigintegers[i];
      row[bigint] = String(entity[bigint]);
    }
    // Translate some obj fields to DB field name (because of DB keywords)
    let toTranslate = that.translated || {};
    let toDBFields = _.keys(toTranslate);
    for (let i = 0, len = toDBFields.length; i < len; i++) {
      let objField = toDBFields[i];
      row[toTranslate[objField]] = row[objField];
    }
    return row;
  }
}