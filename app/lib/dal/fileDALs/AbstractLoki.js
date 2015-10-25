/**
 * Created by cgeek on 16/10/15.
 */

var Q = require('q');
var _ = require('underscore');

module.exports = AbstractLoki;

function AbstractLoki(collection, fileDAL) {

  "use strict";

  let that = this;
  let cores = [], p = fileDAL;
  while (p) {
    if (p.core) {
      cores.push(p.core);
    }
    p = p.parentDAL;
  }
  cores = _.sortBy(cores, (b) => b.forkPointNumber);

  this.IMMUTABLE_FIELDS = true;

  this.collection = collection;

  this.lokiFind = function(baseConditions, metaConditions) {
    let found = collection.find(baseConditions);
    found = found.map((idty) => {
      cores.forEach(function(core){
        let meta = idty.metaData[metaKey(core)];
        _.extend(idty, meta || {});
      });
      return idty;
    });
    if (metaConditions) {
      found = _.where(found, metaConditions);
    }
    return Q(that.decorate(found));
  };

  this.lokiFindOne = function(baseConditions, metaConditions, fieldsProperty) {
    let conditions = baseConditions;
    if (fieldsProperty == that.IMMUTABLE_FIELDS) {
      conditions = {
        $and: [baseConditions, metaConditions]
      };
    }
    let found = collection.find(conditions);
    let searchFailed = false;
    if (found.length == 0) {
      searchFailed = true;
      found = collection.find(baseConditions);
    }
    found = found.map((idty) => {
      cores.forEach(function(core){
        let meta = idty.metaData[metaKey(core)];
        _.extend(idty, meta || {});
      });
      return idty;
    });
    if (metaConditions && (fieldsProperty != that.IMMUTABLE_FIELDS || searchFailed)) {
      found = _.where(found, metaConditions);
    }
    return Q(decorateOne(found[0] || null));
  };

  this.lokiFindInAll = function(metaConditions) {
    let found = collection.find();
    found = found.map((idty) => {
      cores.forEach(function(core){
        let meta = idty.metaData[metaKey(core)];
        _.extend(idty, meta || {});
      });
      return idty;
    });
    if (metaConditions) {
      found = _.where(found, metaConditions);
    }
    return Q(that.decorate(found));
  };

  function metaKey(core) {
    return [core.forkPointNumber, core.forkPointHash].join('-');
  }

  function decorateOne(res) {
    if (res && fileDAL.core) {
      return _.extend(res, res.metaData[metaKey(fileDAL.core)]);
    }
    return res;
  }

  this.decorate = function(results) {
    if (results.length != undefined) {
      return Q(results.map(decorateOne));
    }
    return Q(decorateOne(results));
  };

  this.metaKey = () => metaKey(fileDAL.core);

  this.lokiSave = (entity) => {
    let uniqueFindConditions = this.idKeys.map((key) => {
      let cond = {};
      cond[key] = entity[key];
      return cond;
    });
    let existing = collection.find({
      $and: uniqueFindConditions
    })[0];
    if (existing) {
      if (!fileDAL.parentDAL) {
        // Save in main branch: overrides main data
        existing = _.extend(existing, entity);
      } else {
        // Save in fork branch: overrides meta data
        existing.metaData[that.metaKey()] = _.pick(entity, this.metaProps);
      }
      collection.update(existing);
    } else {
      entity.metaData = {};
      if (fileDAL.parentDAL) {
        entity.metaData[that.metaKey()] = _.pick(entity, this.metaProps);
      }
      collection.insert(entity);
    }
    return Q(entity);
  };
}