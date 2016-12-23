/**
 * Created by cgeek on 22/08/15.
 */

const _ = require('underscore');
const co = require('co');
const colors = require('colors');
const logger = require('../../logger')('sqlite');

module.exports = AbstractSQLite;

function AbstractSQLite(driver) {

  "use strict";

  const that = this;

  this.ASC = false;
  this.DESC = true;
  this.arrays = [];
  this.booleans = [];
  this.bigintegers = [];
  this.translated = {};

  this.query = (sql, params) => co(function *() {
    try {
      //logger.trace(sql, JSON.stringify(params || []));
      const start = new Date();
      const res = yield driver.executeAll(sql, params || []);
      const duration = (new Date()) - start;
      const entities = res.map(toEntity);
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
      logger.error('ERROR >> %s', sql, JSON.stringify(params || []), e.stack || e.message || e);
      throw e;
    }
  });

  this.cleanData = () => this.query("DELETE FROM " + this.table);

  this.sqlListAll = () => this.query("SELECT * FROM " + this.table);

  this.sqlDeleteAll = () => this.exec("DELETE FROM " + this.table);

  this.sqlFind = (obj, sortObj) => co(function *() {
    const conditions = toConditionsArray(obj).join(' and ');
    const values = toParams(obj);
    const sortKeys = _.keys(sortObj);
    const sort = sortKeys.length ? ' ORDER BY ' + sortKeys.map((k) => "`" + k + "` " + (sortObj[k] ? 'DESC' : 'ASC')).join(',') : '';
    return that.query('SELECT * FROM ' + that.table + ' WHERE ' + conditions + sort, values);
  });

  this.sqlFindOne = (obj, sortObj) => co(function *() {
    const res = yield that.sqlFind(obj, sortObj);
    return res[0];
  });

  this.sqlFindLikeAny = (obj, sort) => co(function *() {
    const keys = _.keys(obj);
    return that.query('SELECT * FROM ' + that.table + ' WHERE ' + keys.map((k) => '`' + k + '` like ?').join(' or '), keys.map((k) => obj[k].toUpperCase()), sort);
  });

  this.sqlRemoveWhere = (obj) => co(function *() {
    const keys = _.keys(obj);
    return that.query('DELETE FROM ' + that.table + ' WHERE ' + keys.map((k) => '`' + k + '` = ?').join(' and '), keys.map((k) => obj[k]));
  });

  this.sqlExisting = (entity) => that.getEntity(entity);

  this.saveEntity = (entity) => co(function *() {
    let toSave = entity;
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    const existing = yield that.getEntity(toSave);
    if (existing) {
      toSave = toRow(toSave);
      const valorizations = that.fields.map((field) => '`' + field + '` = ?').join(', ');
      const conditions = getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
      const setValues = that.fields.map((field) => toSave[field]);
      const condValues = getPKFields().map((k) => toSave[k]);
      return that.query('UPDATE ' + that.table + ' SET ' + valorizations + ' WHERE ' + conditions, setValues.concat(condValues));
    }
    yield that.insert(toSave);
  });

  this.insert = (entity) => co(function *() {
    const row = toRow(entity);
    const values = that.fields.map((f) => row[f]);
    yield that.query(that.getInsertQuery(), values);
  });

  this.getEntity = (entity) => co(function *() {
    const conditions = getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
    const params = toParams(entity, getPKFields());
    return (yield that.query('SELECT * FROM ' + that.table + ' WHERE ' + conditions, params))[0];
  });

  this.deleteEntity = (entity) => co(function *() {
    const toSave = toRow(entity);
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    const conditions = getPKFields().map((field) => '`' + field + '` = ?').join(' and ');
    const condValues = getPKFields().map((k) => toSave[k]);
    return that.query('DELETE FROM ' + that.table + ' WHERE ' + conditions, condValues);
  });

  this.exec = (sql) => co(function *() {
    try {
      // logger.trace(sql);
      return driver.executeSql(sql);
    } catch (e) {
      logger.error('ERROR >> %s', sql);
      throw e;
    }
  });

  this.getInsertQuery = () =>
    "INSERT INTO " + that.table + " (" + getFields(that.fields).map(f => '`' + f + '`').join(',') + ") VALUES (" + "?,".repeat(that.fields.length - 1) + "?);";

  this.getInsertHead = () => {
    const valuesKeys = getFields(that.fields);
    return 'INSERT INTO ' + that.table + " (" + valuesKeys.map(f => '`' + f + '`').join(',') + ") VALUES ";
  };

  this.getInsertValue = (toSave) => {
    if (that.beforeSaveHook) {
      that.beforeSaveHook(toSave);
    }
    const row = toRow(toSave);
    const valuesKeys = getFields(that.fields);
    const values = valuesKeys.map((field) => escapeToSQLite(row[field]));
    return "(" + values.join(',') + ")";
  };

  this.toInsertValues = (entity) => {
    const row = toRow(entity);
    const values = that.fields.map((f) => row[f]);
    const formatted = values.map(escapeToSQLite);
    return "(" + formatted.join(',') + ")";
  };

  /**
   * Make a batch insert.
   * @param records The records to insert as a batch.
   */
  this.insertBatch = (records) => co(function *() {
    const queries = [];
    if (records.length) {
      const insert = that.getInsertHead();
      const values = records.map((src) => that.getInsertValue(src));
      queries.push(insert + '\n' + values.join(',\n') + ';');
    }
    if (queries.length) {
      return that.exec(queries.join('\n'));
    }
  });

  function toConditionsArray(obj) {
    return _.keys(obj).map((k) => {
      if (obj[k].$lte !== undefined) {
        return '`' + k + '` <= ?';
      } else if (obj[k].$gte !== undefined) {
        return '`' + k + '` >= ?';
      } else if (obj[k].$gt !== undefined) {
        return '`' + k + '` > ?';
      }  else if (obj[k].$lt !== undefined) {
        return '`' + k + '` < ?';
      }  else if (obj[k].$null !== undefined) {
        return '`' + k + '` IS ' + (!obj[k].$null ? 'NOT' : '') + ' NULL';
      }  else if (obj[k].$contains !== undefined) {
        return '`' + k + '` LIKE ?';
      } else {
        return '`' + k + '` = ?';
      }
    });
  }

  const toParams = (obj, fields) => {
    let params = [];
    (fields || _.keys(obj)).forEach((f) => {
      if (obj[f].$null === undefined) {
        let pValue;
        if      (obj[f].$lte  !== undefined)      { pValue = obj[f].$lte;  }
        else if (obj[f].$gte  !== undefined)      { pValue = obj[f].$gte;  }
        else if (obj[f].$gt   !== undefined)      { pValue = obj[f].$gt;   }
        else if (obj[f].$lt   !== undefined)      { pValue = obj[f].$lt;   }
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
  };

  const escapeToSQLite = (val) => {
    if (typeof val == "boolean") {
      // SQLite specific: true => 1, false => 0
      if (val !== null && val !== undefined) {
        return val ? 1 : 0;
      } else {
        return null;
      }
    }
    else if (typeof val == "string") {
      return "'" + val.replace(/'/g, "\\'") + "'";
    }
    else if (val === undefined) {
      return "null";
    } else {
      return JSON.stringify(val);
    }
  };

  const getPKFields = () => getFields(that.pkFields);

  const getFields = (fields) => fields.map((f) => getField(f));

  const getField = (f) => that.translated[f] || f;

  function toEntity(row) {
    for (const arr of that.arrays) {
      row[arr] = row[arr] ? JSON.parse(row[arr]) : [];
    }
    // Big integers are stored as strings to avoid data loss
    for (const bigint of that.bigintegers) {
      if (row[bigint] !== null && row[bigint] !== undefined) {
        row[bigint] = parseInt(row[bigint]);
      }
    }
    // Translate some DB fields to obj fields
    let toTranslate = that.translated || {};
    let toDBFields = _.keys(toTranslate);
    for (const objField of toDBFields) {
      row[objField] = row[toTranslate[objField]];
    }
    // Booleans
    for (const f of that.booleans) {
      row[f] = row[f] !== null ? Boolean(row[f]) : null;
    }
    // Transient
    for (const f of (that.transientFields || [])) {
      row[f] = row[f];
    }
    return row;
  }

  function toRow(entity) {
    let row = _.clone(entity);
    for (const arr of that.arrays) {
      row[arr] = JSON.stringify(row[arr] || []);
    }
    // Big integers are stored as strings to avoid data loss
    for (const bigint of that.bigintegers) {
      if (entity[bigint] === null || entity[bigint] === undefined) {
        row[bigint] = null;
      } else {
        row[bigint] = String(entity[bigint]);
      }
    }
    // Translate some obj fields to DB field name (because of DB keywords)
    let toTranslate = that.translated || {};
    let toDBFields = _.keys(toTranslate);
    for (const objField of toDBFields) {
      row[toTranslate[objField]] = row[objField];
    }
    return row;
  }
}