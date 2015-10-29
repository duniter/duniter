/**
 * Created by cgeek on 16/10/15.
 */

var Q = require('q');
var _ = require('underscore');

module.exports = AbstractLoki;

function AbstractLoki(collection, fileDAL, viewFields, loki) {

  "use strict";

  let that = this;
  let cores = getCores();
  let view = getView();

  function find(conditons) {
    if (view) {
      return view.branchResultset().find(conditons).data();
    }
    return collection.find(conditons);
  }

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
    let found = find(conditions);
    let searchFailed = false;
    if (found.length == 0) {
      searchFailed = true;
      found = find(baseConditions);
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
    let found = find();
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

  this.lokiExisting = (entity) => {
    let uniqueFindConditions = this.idKeys.map((key) => {
      let cond = {};
      cond[key] = entity[key];
      return cond;
    });
    return find({
      $and: uniqueFindConditions
    })[0];
  };

  this.lokiSave = (fullEntity) => {
    let entity = fullEntity;
    if (this.propsToSave) {
      entity = _.pick(fullEntity, this.propsToSave || []);
    }
    let existing = this.lokiExisting(entity);
    if (existing) {
      if (!fileDAL.parentDAL) {
        // Save in main branch: overrides main data
        existing = _.extend(existing, entity);
      } else {
        // Save in fork branch: overrides meta data
        existing.metaData[that.metaKey()] = _.pick(entity, this.metaProps);
      }
      console.log(existing);
      collection.update(existing);
    } else {
      entity.metaData = {};
      if (fileDAL.parentDAL) {
        entity.metaData[that.metaKey()] = _.pick(entity, this.metaProps);
      }
      _.pluck(entity, this.metaProps).forEach(function(metaProp){
        entity[metaProp] = false;
      });
      console.log(entity);
      collection.insert(entity);
    }
    return Q(entity);
  };

  function getCores() {
    let theCores = [], p = fileDAL;
    while (p) {
      if (p.core) {
        theCores.push(p.core);
      }
      p = p.parentDAL;
    }
    return _.sortBy(theCores, (b) => b.forkPointNumber);
  }

  function getView() {
    let branchView;
    if (viewFields && loki) {
      let blockCollection = loki.getCollection('blocks');
      let current = blockCollection.chain().find({ fork: false }).simplesort('number', true).limit(1).data()[0];
      let conditions = cores.map((b) => {
        let objNumber = {}, objHash = {};
        objNumber[viewFields.block_number] = b.forkPointNumber;
        objHash[viewFields.block_hash] = b.forkPointHash;
        if (viewFields.block_number && viewFields.block_hash) {
          return { $and: [objNumber, objHash] };
        } else if (viewFields.block_hash) {
          return objHash;
        } else {
          return objNumber;
        }
      });
      if (!current) {
        conditions.unshift({
          $and: [{
            block_number: 0
          }, {
            block_hash: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709'
          }]
        });
      }
      conditions.unshift({
        block_number: { $lte: current ? current.number : -1 }
      });
      branchView = collection.addDynamicView(['branch', fileDAL.name].join('_'));
      branchView.applyFind({ '$or': conditions });
      branchView.conditions = conditions;
    }
    return branchView;
  }
}