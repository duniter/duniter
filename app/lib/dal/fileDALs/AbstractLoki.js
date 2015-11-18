/**
 * Created by cgeek on 16/10/15.
 */

var Q = require('q');
var _ = require('underscore');

module.exports = AbstractLoki;

function AbstractLoki(collection) {

  "use strict";

  function find(conditons) {
    return collection.find(conditons);
  }

  this.IMMUTABLE_FIELDS = true;

  this.collection = collection;

  this.lokiFind = (baseConditions, metaConditions) =>
    Q(collection.find(getConditions(baseConditions, metaConditions)));

  this.lokiFindOne = (baseConditions, metaConditions) =>
    Q(collection.find(getConditions(baseConditions, metaConditions))[0] || null);

  this.lokiFindInAll = (metaConditions) =>
    Q(find(metaConditions));

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
      // Save in main branch: overrides main data
      existing = _.extend(existing, entity);
      collection.update(existing);
    } else {
      collection.insert(entity);
    }
    return Q(entity);
  };

  function getConditions(baseConditions, metaConditions) {
    let conditions = {
      $and: [baseConditions, metaConditions]
    };
    if (!baseConditions || !metaConditions) {
      conditions = baseConditions || metaConditions;
    }
    return conditions;
  }
}