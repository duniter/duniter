var Q       = require('q');
var _       = require('underscore');
var async   = require('async');
var moment = require('moment');
var util = require('util');
var sqlite3 = require('sqlite3');
var logger  = require('../../lib/logger')('data');

module.exports = {
  memory: function() {
    return new SQLiteDAL(new sqlite3.Database(':memory:'));
  },
  file: function(fileName) {
    return new SQLiteDAL(new sqlite3.Database(fileName));
  }
};

function SQLiteDAL(db) {

  var that = this;

  var models = [EndpointModel, PeerModel];

  this.run = function(sql, params, done) {
    logger.debug('Query: %s | Params: %s', sql, JSON.stringify(params));
    return Q.Promise(function(resolve, reject){
      db.all(sql, params || [], function(err) {
        err ? reject(err) : resolve();
        done && done(err);
      });
    });
  };

  this.batch = function(queries, done) {
    logger.debug('Batch of %s queries...', queries.length);
    return Q.Promise(function(resolve, reject){
      db.serialize(function() {
        async.forEachSeries(queries, function(query, callback) {
          var sql = query.sql;
          var params = query.params;
          logger.debug('Query: %s | Params: %s', sql, JSON.stringify(params));
          db.run(sql, params || [], callback);
        }, function(err) {
          done && done(err);
          if(err) reject(err); else resolve();
        });
      });
    });
  };

  this.query = function(sql, params, done) {
    logger.debug('Query: %s | Params: %s', sql, JSON.stringify(params));
    return Q.Promise(function(resolve, reject){
      db.all(sql, params || [], function(err, rows) {
        if (err) {
          logger.error('sqlite error: %s', err.message || err);
          reject(err);
        } else {
          logger.debug('Found: %s rows', rows.length);
          resolve(rows);
        }
        done && done(err, rows);
      })
    });
  };

  this.queryOne = function(sql, params, done) {
    logger.debug('Query: %s | Params: %s', sql, JSON.stringify(params));
    return Q.Promise(function(resolve, reject){
      db.all(sql, params || [], function (err, rows) {
        if (err)
          reject(err);
        else {
          if (rows.length == 0){
            logger.warn('Entity not found');
            reject('Cannot find single result: empty result');
            done && done(null, null);
          }
          else if (rows.length >= 2){
            logger.warn('Multiple entities found');
            reject('Cannot find single result: several results');
            done && done(null, null);
          } else {
            logger.debug('Entity found');
            resolve(rows[0]);
            done && done(err, rows[0]);
          }
        }
      });
    });
  };

  this.save = function(entity, modelClass, isNew, done) {
    logger.debug('Save %s', new modelClass().table);
    return that.batch(that.getSaveQueries(entity, modelClass, isNew), done);
  };

  this.getSaveQueries = function(entity, modelClass, isNew) {
    return [that.getSaveEntityQuery(entity, modelClass, isNew)].concat(that.getOneToManyQueries(entity, modelClass));
  };

  this.getSaveEntityQuery = function(entity, modelClass, isNew) {
    var model = new modelClass();
    var fields = ['created', 'updated'].concat(model.fields);
    var values = fields.map(function(f) {
      return entity[f];
    });
    if (isNew) {
      values[0] = moment().unix();
    }
    values[1] = moment().unix();
    var query = isNew ?
    'INSERT INTO ' + model.table + ' (' + model.primary + ',' + fields.join(',') + ') VALUES (?,' + values.map(function(){ return '?' }).join(',') + ')' :
    'UPDATE ' + model.table + ' SET ' + fields.join('=?, ') + '=? WHERE ' + model.primary + ' = ?';
    var params = isNew ? [entity[model.primary]].concat(values) : values.concat(entity[model.primary]);
    return { sql: query, params: params };
  };

  this.getOneToManyQueries = function(entity, modelClass) {
    var queries = [];
    var model = new modelClass();
    // Remove existing links
    model.oneToManys.forEach(function(o2m){
      var subModel = new o2m.model();
      var subTable = subModel.table;
      queries.push({
        sql: 'DELETE FROM ' + subTable + ' WHERE ' + o2m.fk + ' = ?',
        params: [entity[model.primary]]
      });
    });
    // Recreate new ones
    model.oneToManys.forEach(function(o2m){
      var subModel = new o2m.model();
      (entity[o2m.property] || []).forEach(function(o2mEntity, index){
        var persistable = o2m.toDB(o2mEntity, index);
        persistable[subModel.primary] = entity[model.primary];
        queries.push(that.getSaveEntityQuery(persistable, o2m.model, true));
      });
    });
    return queries;
  };

  this.listAllPeers = function(done) {
    return that.queryForMultipleEntities(PeerModel, [], [], done);
  };

  this.nullIfError = function(promise, done) {
    return promise
      .then(function(p){
        done && done(null, p);
        return p;
      })
      .fail(function(){
        done && done(null, null);
        return null;
      });
  };

  this.getPeer = function(pubkey, done) {
    return that.queryEntityById(PeerModel, pubkey, done);
  };
  
  this.queryEntityById = function(Model, id, done) {
    return that.queryForSingleEntity(Model, [new Model().primary], [id], done);
  };

  this.queryForSingleEntity = function(Model, fields, params, done) {
    return that.queryForEntity(Model, that.queryOne, fields, params, done);
  };

  this.queryForMultipleEntities = function(Model, fields, params, done) {
    return that.queryForEntity(Model, that.query, fields, params, done);
  };

  this.queryForEntity = function(ModelClass, queryMethod, fields, params, done) {
    var model = new ModelClass();
    var conditions = fields.length ? fields.join('=?, ') + '=?' : '1';
    return queryMethod('SELECT * FROM ' + model.table + ' WHERE ' + conditions, params)
      .tap(function(rows){
        if(rows.length != undefined) {
          return Q.all(rows.map(function(row) {
            return Q.all(model.oneToManys.map(function(o2m) {
              return model.lazyLoadCollection(that, row, o2m.property);
            }))
          }))
        } else {
          var row = rows;
          return Q.all(model.oneToManys.map(function(o2m) {
            return model.lazyLoadCollection(that, row, o2m.property);
          }))
        }
      })
      .then(function(rows){
        done && done(null, rows);
        return rows;
      })
      .fail(function(err){
        done && done(err);
        throw err;
      });
  };

  this.getPeerOrNull = function(pubkey, done) {
    return that.nullIfError(that.getPeer(pubkey), done);
  };

  this.getPeers = function(pubkeys, done) {
    return Q.all(pubkeys.map(function(pubkey) {
      return that.getPeerOrNull(pubkey);
    })).spread(function(){
      var peers = Array.prototype.slice.call(arguments).filter(function(p) {
        return !!p;
      });
      done(null, peers);
      return peers;
    }).fail(done);
  };

  this.findAllPeersNEWUPBut = function(pubkeys, done) {
    return that.listAllPeers()
      .then(function(peers){
        return peers.filter(function(peer) {
          return pubkeys.indexOf(peer.pubkey) == -1;
        });
      })
      .then(function(matchingPeers){
        done && done(null, matchingPeers);
        return matchingPeers;
      })
      .fail(done);
  };

  this.listAllPeersWithStatusNewUP = function(minSigDate, done) {
    return that.query('SELECT * FROM peer WHERE status IN (\'NEW\', \'NEW_BACK\', \'UP\') AND statusTS >= ?', [minSigDate], done);
  };

  this.getRandomlyUPsWithout = function(pubkeys, minSigDate, done) {
    return that.listAllPeersWithStatusNewUP(minSigDate)
      .then(function(peers){
        return peers.filter(function(peer) {
          return pubkeys.indexOf(peer.pubkey) == -1;
        });
      })
      .then(function(matchingPeers){
        done && done(null, matchingPeers);
        return matchingPeers;
      })
      .fail(done);
    //var that = this;
    //that.find({ pub: { $nin: pubs }, status: { $in: ['NEW', 'NEW_BACK', 'UP'] }, statusSigDate: { $gte: minSigDate } })
    //  .sort({ 'updated': -1 })
    //  .exec(done);
  };

  this.setDownWithStatusOlderThan = function(minSigTimestamp, done) {
    return that.run("UPDATE peer SET status = 'DOWN' WHERE statusTS >= ?", [minSigTimestamp], done);
  };

  this.setPeerDown = function(pubkey, done) {
    return that.run("UPDATE peer SET status = 'DOWN' WHERE pubkey = ?", [pubkey])
      .then(function(){
        done && done();
      })
      .fail(done);
  };

  this.savePeer = function(peer, done) {
    return that.getPeerOrNull(peer && peer.pubkey)
      .then(function(p){
        return that.save(_(p || {}).extend(peer), PeerModel, !p, done);
      });
  };

  this.initDabase = function() {
    return Q.Promise(function(resolve, reject){
      async.forEachSeries(models, function(model, callback) {
        db.run(new model().sqlCreate(), [], callback);
      }, function(err) {
        err ? reject(err) : resolve();
      });
    });
  };

  this.dropDabase = function() {
    return Q.Promise(function(resolve, reject){
      async.forEachSeries(models, function(model, callback) {
        db.run(new model().sqlDrop(), [], callback);
      }, function(err) {
        err ? reject(err) : resolve();
      });
    });
  };

  this.dropModel = function(name) {
    return Q.Promise(function(resolve, reject){
      async.forEachSeries(models, function(model, callback) {
        var modelInstance = new model();
        if (modelInstance.table == name) {
          that.run(new model().sqlDrop(), [], callback);
        } else callback();
      }, function(err) {
        err ? reject(err) : resolve();
      });
    });
  };
}

function Model() {

  var that = this;

  this.oneToManys = this.oneToManys || [];

  this.sqlDrop= function() {
    return "DROP TABLE IF EXISTS " + this.table;
  };

  this.lazyLoadCollection = function(dal, entity, collectionProperty) {
    return Q.Promise(function(resolve, reject){
      async.forEachSeries(that.oneToManys, function(o2m, callback) {
        if (o2m.property == collectionProperty) {
          var subModel = new o2m.model();
          dal.query("SELECT * FROM " + subModel.table + " WHERE " + subModel.primary + " = ?", [entity[that.primary]])
            .then(function(rows){
              entity[collectionProperty] = o2m.toEntities(rows);
              return null;
            })
            .then(callback)
            .fail(callback);
        } else {
          callback();
        }
      }, function(err) {
        err ? reject(err) : resolve();
      });
    });
  }
}

function EndpointModel() {

  Model.call(this);

  this.table = 'endpoint';
  this.primary = 'pubkey';
  this.fields = [
    'currency',
    'protocol',
    'indexNb'
  ];

  this.sqlCreate = function() {
    return 'CREATE TABLE IF NOT EXISTS endpoint (' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'currency VARCHAT(50) DEFAULT NULL,' +
      'protocol VARCHAR(255) DEFAULT NULL,' +
      'indexNb INTEGER DEFAULT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (pubkey), UNIQUE(pubkey, indexNb)' +
      ');';
  };
}

function PeerModel() {

  Model.call(this);

  this.table = 'peer';
  this.primary = 'pubkey';
  this.fields = [
    'block',
    'currency',
    'signature',
    'status',
    'statusTS'
  ];

  this.oneToManys = [{
    property: 'endpoints',
    model: EndpointModel,
    fk: 'pubkey',
    toDB: function(str, index) {
      return {
        currency: '',
        protocol: str,
        indexNb: index
      }
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        return row.protocol;
      })
    }
  }];

  this.sqlCreate = function() {
    return 'CREATE TABLE IF NOT EXISTS peer (' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'block VARCHAT(60) DEFAULT NULL,' +
      'currency VARCHAT(50) DEFAULT NULL,' +
      'signature VARCHAT(100) DEFAULT NULL,' +
      'status VARCHAT(10) DEFAULT NULL,' +
      'statusTS DATETIME DEFAULT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (pubkey)' +
      ');';
  }
}

util.inherits(EndpointModel, Model);
util.inherits(PeerModel, Model);
