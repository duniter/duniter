var Q       = require('q');
var _       = require('underscore');
var async   = require('async');
var moment = require('moment');
var uuid = require('node-uuid').v4;
var util = require('util');
var sqlite3 = require('sqlite3');
var logger  = require('../../lib/logger')('data');
var Identity = require('../entity/identity');
var Certification = require('../entity/certification');
var Membership = require('../entity/membership');

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

  var currentNumber = null;

  var models = [
    EndpointModel,
    PeerModel,
    BlockModel,
    IdentityModel,
    CertificationModel,
    JoinerModel,
    ActiveModel,
    LeaverModel,
    ExcludedModel,
    TransactionModel,
    SignatoryModel,
    InputModel,
    OutputModel,
    TxSignatoryModel,
    LinkModel
  ];

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
          logger.debug('Batch Query: %s | Params: %s', sql, JSON.stringify(params));
          db.run(sql, params || [], callback);
        }, function(err) {
          done && done(err);
          if(err) reject(err); else resolve();
        });
      });
    });
  };

  this.query = function(sql, params, done) {
    return Q.Promise(function(resolve, reject){
      var start = new Date();
      db.all(sql, params || [], function(err, rows) {
        if (err) {
          logger.debug('Query: %s | Params: %s', sql, JSON.stringify(params));
          logger.error('sqlite error: %s', err.message || err);
          reject(err);
        } else {
          logger.debug('Time: %s ms | Query: %s | Params: %s | Found %s rows', (new Date() - start), sql, JSON.stringify(params), rows.length);
          //logger.debug('Found: %s rows', rows.length);
          resolve(rows);
        }
        done && done(err, rows);
      })
    });
  };

  this.queryOne = function(sql, givenParams, done) {
    var params = givenParams || [];
    //logger.debug('Query: %s | Params: %s', sql, JSON.stringify(params));
    return Q.Promise(function(resolve, reject){
      var start = new Date();
      db.all(sql, params || [], function (err, rows) {
        if (err)
          reject(err);
        else {
          if (rows.length == 0){
            logger.warn('Time: %s ms | Query: %s | Params: %s | Not found', (new Date() - start), sql, JSON.stringify(params));
            reject('Cannot find single result: empty result');
            done && done(null, null);
          }
          else if (rows.length >= 2){
            logger.warn('Time: %s ms | Query: %s | Params: %s | Multiple found', (new Date() - start), sql, JSON.stringify(params));
            reject('Cannot find single result: several results');
            done && done(null, null);
          } else {
            logger.debug('Time: %s ms | Query: %s | Params: %s', (new Date() - start), sql, JSON.stringify(params));
            resolve(rows[0]);
            done && done(err, rows[0]);
          }
        }
      });
    });
  };

  this.queryAggregate = function(sql, params, done) {
    return that.queryOne(sql, params)
      .then(function(res){
        return res.aggregate;
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
    var valueFields = ['created', 'updated'].concat(model.getFields());
    var fields = ['created', 'updated'].concat(model.getAliasedFields());
    var values = valueFields.map(function(f) {
      return entity[f];
    });
    if (model.primary == "id" && isNew) {
      entity[model.primary] = uuid();
    }
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
      (entity[o2m.property] || []).forEach(function(o2mEntity, index){
        var persistable = o2m.toDB(o2mEntity, index);
        persistable[o2m.fk] = entity[model.primary];
        queries.push(that.getSaveEntityQuery(persistable, o2m.model, true));
        var subQueries = that.getOneToManyQueries(persistable, o2m.model);
        subQueries.forEach(function(sub){
          queries.push(sub);
        });
        //// Recursive OneToMany
        //new o2m.model().oneToManys.forEach(function(subO2M){
        //  (entity[o2m.property] || []).forEach(function(subEntity){
        //    queries.push();
        //  });
        //});
      });
    });
    return queries;
  };

  this.listAllPeers = function(done) {
    return that.queryForMultipleEntities(PeerModel, [], [], done);
  };

  this.listAllBlocks = function(done) {
    return that.queryForMultipleEntities(BlockModel, [], [], done);
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

  this.getBlock = function(number, done) {
    return that.queryEntityById(BlockModel, number, done);
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
    return that.fillInEntity(queryMethod('SELECT * FROM ' + model.table + ' WHERE ' + conditions, params), ModelClass, done);
  };

  this.fillInEntity = function(queryPromise, ModelClass, done) {
    var model = new ModelClass();
    return queryPromise
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

  this.getCurrent = function(done) {
    return that.getBlockCurrent(done);
  };

  this.getCurrentBlockOrNull = function(done) {
    return that.nullIfError(that.getBlockCurrent(), done);
  };

  this.getPromoted = function(number, done) {
    return that.getBlock(number, done);
  };

  // Block
  this.getLastBeforeOrAt = function (t, done) {
    return that.nullIfError(
      that.fillInEntity(that.queryOne('SELECT * FROM block WHERE medianTime <= ? ORDER BY number DESC', [t]), BlockModel), done);
  };

  this.lastUDBlock = function(done) {
    return that.nullIfError(
      that.fillInEntity(that.queryOne('SELECT * FROM block WHERE dividend > 0 ORDER BY number DESC', []), BlockModel), done);
  };

  this.getRootBlock = function(done) {
    return that.nullIfError(
      that.fillInEntity(that.queryOne('SELECT * FROM block WHERE number = 0', []), BlockModel), done);
  };

  this.lastBlocksOfIssuer = function(issuer, count, done) {
    return that.nullIfError(
      that.fillInEntity(that.query('SELECT * FROM block WHERE issuer = ? ORDER BY number DESC LIMIT ?', [issuer, count]), BlockModel), done);
  };

  this.getLastBlocks = function(count, done) {
    return that.nullIfError(
      that.fillInEntity(that.query('SELECT * FROM block ORDER BY number DESC LIMIT ?', [count]), BlockModel), done);
  };

  this.getBlocksBetween = function(start, end, done) {
    return that.nullIfError(
      that.fillInEntity(that.query('SELECT * FROM block WHERE number BETWEEN ? AND ? ORDER BY number DESC', [start, end]), BlockModel), done);
  };

  this.getBlockCurrent = function(done) {
    return (currentNumber == null ? that.queryAggregate("SELECT MAX(number) as aggregate FROM block") : Q(currentNumber))
      .then(function(number) {
        if (number == null) currentNumber = -1;
        return currentNumber != -1 ? that.getBlockOrNull(currentNumber) : null;
      })
      .then(function(block){
        done && done(null, block);
        return block;
      });
  };

  this.getBlockFrom = function(number) {
    return that.query("SELECT * FROM block WHERE number >= ? ORDER BY number ASC", [number])
      .then(that.getBlockOrNull);
  };

  this.getBlocksUntil = function(number, done) {
    return that.query("SELECT * FROM block WHERE number < ? ORDER BY number ASC", [number], done);
  };

  this.getValidLinksFrom = function(from, done) {
    return that.query("SELECT * FROM link WHERE source = ? AND NOT obsolete", [from], done);
  };

  this.getValidLinksTo = function(to, done) {
    return that.query("SELECT * FROM link WHERE target = ? AND NOT obsolete", [to], done);
  };

  this.currentValidLinks = function(fpr, done) {
    return that.query("SELECT * FROM link WHERE target = ? AND NOT obsolete", [fpr], done);
  };

  this.getObsoletesFromTo = function(from, to, done) {
    return that.query("SELECT * FROM link WHERE source = ? AND target = ? AND obsolete ORDER BY on_timestamp DESC LIMIT 1", [from, to], done);
  };

  this.getValidFromTo = function(from, to, done) {
    return that.query("SELECT * FROM link WHERE source = ? AND target = ? AND NOT obsolete", [from, to], done);
  };

  this.existsLinkFromOrAfterDate = function(from, to, maxDate, done) {
    return that.query("SELECT * FROM link WHERE source = ? AND target = ? AND on_timestamp >= ?", [from, to, maxDate])
      .then(function(rows){
        done && done(null, rows.length);
        return rows.length > 0;
      });
  };

  this.obsoletesLinks = function(minTimestamp, done) {
    return that.run("UPDATE link SET obsolete = 1 WHERE on_timestamp <= ?", [minTimestamp], done);
  };

  this.getPeerOrNull = function(pubkey, done) {
    return that.nullIfError(that.getPeer(pubkey), done);
  };

  this.getBlockOrNull = function(number, done) {
    return that.nullIfError(that.getBlock(number), done);
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
    return saveEntity(PeerModel, peer, done);
  };

  this.saveBlock = function(block, done) {
    return saveEntity(BlockModel, block)
      .then(function(){
        currentNumber = block.number;
        done && done();
      });
  };

  this.saveLink = function(link, done) {
    return saveEntity(LinkModel, link, done);
  };

  function saveEntity(model, entity, done) {
    return getEntityOrNull(model, entity)
      .then(function(found){
        return that.save(_(found || {}).extend(entity), model, !found, done);
      });
  }

  function getEntityOrNull(model, entity) {
    return that.nullIfError(that.queryEntityById(model, entity[new model().primary]));
  }

  this.initDabase = function() {
    return Q.Promise(function(resolve, reject){
      async.forEachSeries(models, function(model, callback) {
        var sqlValue = new model().sqlCreate();
        var sqls = typeof sqlValue == 'object' ? sqlValue : [sqlValue];
        async.forEachSeries(sqls, function(sql, callback) {
          db.run(sql, [], callback);
        }, callback);
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
  this.aliases = this.aliases || {};

  this.getFields = function() {
    return _(that.fields).without("id", that.primary);
  };

  this.getAliasedFields = function() {
    return _(that.fields.map(function(f) {
      return that.aliases[f] || f;
    })).without("id", that.primary);
  };

  this.sqlDrop= function() {
    return "DROP TABLE IF EXISTS " + this.table;
  };

  this.lazyLoadCollection = function(dal, entity, collectionProperty) {
    return Q.Promise(function(resolve, reject){
      async.forEachSeries(that.oneToManys, function(o2m, callback) {
        if (o2m.property == collectionProperty) {
          dal.queryForEntity(o2m.model, dal.query, [o2m.fk], [entity[that.primary]])
            .then(function(entities){
              entity[collectionProperty] = o2m.toEntities(entities);
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
      'currency VARCHAR(50) DEFAULT NULL,' +
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
      'block VARCHAR(60) DEFAULT NULL,' +
      'currency VARCHAR(50) DEFAULT NULL,' +
      'signature VARCHAR(100) DEFAULT NULL,' +
      'status VARCHAR(10) DEFAULT NULL,' +
      'statusTS DATETIME DEFAULT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (pubkey)' +
      ');';
  }
}

function BlockModel() {

  Model.call(this);

  var that = this;

  this.table = 'block';
  this.primary = 'number';
  this.fields = [
    'hash',
    'signature',
    'version',
    'currency',
    'issuer',
    'parameters',
    'previousHash',
    'previousIssuer',
    'membersCount',
    'monetaryMass',
    'UDTime',
    'medianTime',
    'dividend',
    'time',
    'powMin',
    'number',
    'nonce'
  ];

  this.oneToManys = [{
    property: 'identities',
    model: IdentityModel,
    fk: 'block',
    toDB: function(inline, index) {
      var idty = Identity.statics.fromInline(inline);
      idty.indexNb = index;
      return idty;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        row.time = new Date(row.time);
        return Identity.statics.toInline(row);
      })
    }
  },{
    property: 'certifications',
    model: CertificationModel,
    fk: 'block',
    toDB: function(inline, index) {
      var idty = Certification.statics.fromInline(inline);
      idty.indexNb = index;
      return idty;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        return Certification.statics.toInline(row, CertificationModel);
      })
    }
  },{
    property: 'joiners',
    model: JoinerModel,
    fk: 'block',
    toDB: function(inline, index) {
      var ms = Membership.statics.fromInline(inline, 'IN');
      ms.indexNb = index;
      return ms;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        row.certts = new Date(row.certts);
        return Membership.statics.toInline(row);
      })
    }
  },{
    property: 'actives',
    model: ActiveModel,
    fk: 'block',
    toDB: function(inline, index) {
      var ms = Membership.statics.fromInline(inline, 'IN');
      ms.indexNb = index;
      return ms;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        row.certts = new Date(row.certts);
        return Membership.statics.toInline(row);
      })
    }
  },{
    property: 'leavers',
    model: LeaverModel,
    fk: 'block',
    toDB: function(inline, index) {
      var idty = Membership.statics.fromInline(inline, 'OUT');
      idty.indexNb = index;
      return idty;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        row.certts = new Date(row.certts);
        return Membership.statics.toInline(row);
      })
    }
  },{
    property: 'excluded',
    model: ExcludedModel,
    fk: 'block',
    toDB: function(inline, index) {
      var excluded = { pubkey: inline };
      excluded.indexNb = index;
      return excluded;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        return row.pubkey;
      })
    }
  },{
    property: 'transactions',
    model: TransactionModel,
    fk: 'block',
    toDB: function(tx, index) {
      tx.indexNb = index;
      return tx;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        delete row.created;
        delete row.updated;
        return row;
      });
    }
  }];

  this.sqlCreate = function() {
    return ['CREATE TABLE IF NOT EXISTS block (' +
      'hash VARCHAR(40) NOT NULL,' +
      'signature VARCHAR(100) NOT NULL,' +
      'currency VARCHAR(50) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'parameters VARCHAR(255) NOT NULL,' +
      'previousHash VARCHAR(50) NOT NULL,' +
      'previousIssuer VARCHAR(50) NOT NULL,' +
      'version INTEGER NOT NULL,' +
      'membersCount INTEGER NOT NULL,' +
      'monetaryMass INTEGER DEFAULT 0,' +
      'UDTime DATETIME,' +
      'medianTime DATETIME NOT NULL,' +
      'dividend INTEGER NOT NULL,' +
      'time DATETIME NOT NULL,' +
      'powMin INTEGER NOT NULL,' +
      'number INTEGER NOT NULL,' +
      'nonce INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (number)' +
      ');',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_block_number ON block (number);'
    ];
  }
}

function IdentityModel() {

  Model.call(this);

  this.table = 'identity';
  this.primary = 'pubkey';
  this.fields = [
    'pubkey',
    'block',
    'sig',
    'time',
    'uid',
    'currency',
    'indexNb'
  ];

  this.sqlCreate = function() {
    return [
      'CREATE TABLE IF NOT EXISTS identity (' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'block INTEGER DEFAULT NULL,' +
      'currency VARCHAR(50) DEFAULT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'time DATETIME DEFAULT NULL,' +
      'uid VARCHAR(255) NOT NULL,' +
      'indexNb INTEGER DEFAULT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (pubkey)' +
      ');',
      'CREATE INDEX IF NOT EXISTS idx_idty_block_number ON identity (block);'
      ];
  };
}

function CertificationModel() {

  Model.call(this);

  this.table = 'cert';
  this.primary = 'id';
  this.fields = [
    'id',
    'pubkey',
    'to',
    'block',
    'sig',
    'currency',
    'indexNb'
  ];

  this.aliases = {
    'pubkey': 'fromKey',
    'to': 'toKey',
    'block_number': 'block'
  };

  this.sqlCreate = function() {
    return [
      'CREATE TABLE IF NOT EXISTS cert (' +
      'id CHAR(36) NOT NULL,' +
      'fromKey VARCHAR(50) NOT NULL,' +
      'toKey VARCHAR(50) NOT NULL,' +
      'currency VARCHAR(50) DEFAULT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'block INTEGER NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id), UNIQUE(fromKey, toKey, block)' +
      ');',
      'CREATE INDEX IF NOT EXISTS idx_cert_block_number ON cert (block);'
    ];
  };
}

function MembershipModel() {

  var that = this;

  Model.call(this);
  this.primary = 'id';
  this.fields = [
    'id',
    'block',
    'number',
    'issuer',
    'fpr',
    'userid',
    'signature',
    'certts',
    'currency',
    'indexNb'
  ];

  this.sqlCreate = function() {
    return [
      'CREATE TABLE IF NOT EXISTS ' + that.table + ' (' +
      'id CHAR(36) NOT NULL,' +
      'issuer VARCHAR(50) NOT NULL,' +
      'currency VARCHAR(50) DEFAULT NULL,' +
      'signature VARCHAR(100) NOT NULL,' +
      'number INTEGER NOT NULL,' +
      'fpr CHAR(40) DEFAULT NULL,' +
      'userid VARCHAR(255) DEFAULT NULL,' +
      'block CHAR(60) NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'certts DATETIME DEFAULT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');',
      'CREATE INDEX IF NOT EXISTS idx_' + that.table + '_block_number ON ' + that.table + ' (number);'
    ];
  };
}

function JoinerModel() {
  MembershipModel.call(this);
  this.table = 'joiner';
}

function ActiveModel() {
  MembershipModel.call(this);
  this.table = 'active';
}

function LeaverModel() {
  MembershipModel.call(this);
  this.table = 'leaver';
}

function ExcludedModel() {

  Model.call(this);

  this.table = 'excluded';
  this.primary = 'id';
  this.fields = [
    'id',
    'block',
    'pubkey',
    'currency',
    'indexNb'
  ];

  this.sqlCreate = function() {
    return [
      'CREATE TABLE IF NOT EXISTS excluded (' +
      'id CHAR(36) NOT NULL,' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'currency VARCHAR(50) DEFAULT NULL,' +
      'block INTEGER NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');',
      'CREATE INDEX IF NOT EXISTS idx_excluded_block_number ON excluded (block);'
    ];
  };
}

function TransactionModel() {

  Model.call(this);

  this.table = 'tx';
  this.primary = 'id';
  this.fields = [
    'id',
    'comment',
    'block',
    'indexNb'
  ];

  this.sqlCreate = function() {
    return [
      'CREATE TABLE IF NOT EXISTS tx (' +
      'id CHAR(36) NOT NULL,' +
      'comment VARCHAR(255) NOT NULL,' +
      'block INTEGER NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');',
      'CREATE INDEX IF NOT EXISTS idx_tx_block_number ON tx (block);'
    ];
  };

  this.oneToManys = [{
    property: 'signatories',
    model: SignatoryModel,
    fk: 'tx_id',
    toDB: function(inline, index) {
      var signatory = { pubkey: inline };
      signatory.indexNb = index;
      return signatory;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        return row.pubkey;
      });
    }
  },{
    property: 'signatures',
    model: TxSignatoryModel,
    fk: 'tx_id',
    toDB: function(inline, index) {
      var signatory = { sig: inline };
      signatory.indexNb = index;
      return signatory;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        return row.sig;
      });
    }
  },{
    property: 'inputs',
    model: InputModel,
    fk: 'tx_id',
    toDB: function(inline, index) {
      var sp = inline.split(':');
      var input = {
        index: parseInt(sp[0]),
        type: sp[1],
        number: parseInt(sp[2]),
        fingerprint: sp[3],
        amount: parseInt(sp[4])
      };
      input.indexNb = index;
      return input;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        return [row.index_signatory, row.source_type, row.source_number, row.source_hash, row.amount].join(':');
      });
    }
  },{
    property: 'outputs',
    model: OutputModel,
    fk: 'tx_id',
    toDB: function(inline, index) {
      var sp = inline.split(':');
      var output = {
        pubkey: sp[0],
        amount: parseInt(sp[1])
      };
      output.indexNb = index;
      return output;
    },
    toEntities: function(rows) {
      return rows.map(function(row) {
        return [row.recipient, row.amount].join(':');
      });
    }
  }];
}

function SignatoryModel() {

  Model.call(this);

  this.table = 'signatory';
  this.primary = 'id';
  this.fields = [
    'id',
    'tx_id',
    'pubkey',
    'indexNb'
  ];

  this.sqlCreate = function() {
    return 'CREATE TABLE IF NOT EXISTS signatory (' +
      'id CHAR(36) NOT NULL,' +
      'tx_id CHAR(36) NOT NULL,' +
      'pubkey VARCHAR(50) NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');';
  };
}

function TxSignatoryModel() {

  Model.call(this);

  this.table = 'tx_signature';
  this.primary = 'id';
  this.fields = [
    'id',
    'tx_id',
    'sig',
    'indexNb'
  ];

  this.sqlCreate = function() {
    return 'CREATE TABLE IF NOT EXISTS tx_signature (' +
      'id CHAR(36) NOT NULL,' +
      'tx_id CHAR(36) NOT NULL,' +
      'sig VARCHAR(100) NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');';
  };
}

function InputModel() {

  Model.call(this);

  this.table = 'input';
  this.primary = 'id';
  this.fields = [
    'id',
    'tx_id',
    'index',
    'type',
    'number',
    'fingerprint',
    'amount',
    'indexNb'
  ];

  this.aliases = {
    'index': 'index_signatory',
    'type': 'source_type',
    'number': 'source_number',
    'fingerprint': 'source_hash'
  };

  this.sqlCreate = function() {
    return 'CREATE TABLE IF NOT EXISTS input (' +
      'id CHAR(36) NOT NULL,' +
      'tx_id CHAR(36) NOT NULL,' +
      'index_signatory INTEGER NOT NULL,' +
      'source_type CHAR(1) NOT NULL,' +
      'source_number INTEGER NOT NULL,' +
      'source_hash CHAR(40) NOT NULL,' +
      'amount INTEGER NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');';
  };
}

function OutputModel() {

  Model.call(this);

  this.table = 'output';
  this.primary = 'id';
  this.fields = [
    'id',
    'tx_id',
    'pubkey',
    'amount',
    'indexNb'
  ];

  this.aliases = {
    'pubkey': 'recipient'
  };

  this.sqlCreate = function() {
    return 'CREATE TABLE IF NOT EXISTS output (' +
      'id CHAR(36) NOT NULL,' +
      'tx_id CHAR(36) NOT NULL,' +
      'recipient CHAR(50) NOT NULL,' +
      'amount INTEGER NOT NULL,' +
      'indexNb INTEGER NOT NULL,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');';
  };
}

function LinkModel() {

  Model.call(this);

  this.table = 'link';
  this.primary = 'id';
  this.fields = [
    'id',
    'source',
    'target',
    'timestamp',
    'obsolete'
  ];

  this.aliases = {
    'timestamp': 'on_timestamp'
  };

  this.sqlCreate = function() {
    return 'CREATE TABLE IF NOT EXISTS link (' +
      'id CHAR(36) NOT NULL,' +
      'source CHAR(50) NOT NULL,' +
      'target CHAR(50) NOT NULL,' +
      'on_timestamp DATETIME DEFAULT NULL,' +
      'obsolete BOOLEAN DEFAULT true,' +
      'created DATETIME DEFAULT NULL,' +
      'updated DATETIME DEFAULT NULL,' +
      'PRIMARY KEY (id)' +
      ');';
  };
}

util.inherits(EndpointModel, Model);
util.inherits(PeerModel, Model);
util.inherits(BlockModel, Model);
util.inherits(IdentityModel, Model);
util.inherits(MembershipModel, Model);
util.inherits(JoinerModel, MembershipModel);
util.inherits(ActiveModel, MembershipModel);
util.inherits(LeaverModel, MembershipModel);
util.inherits(ExcludedModel, Model);
util.inherits(TransactionModel, Model);
util.inherits(SignatoryModel, Model);
util.inherits(InputModel, Model);
util.inherits(OutputModel, Model);
util.inherits(LinkModel, Model);
