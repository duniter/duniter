"use strict";
var stream     = require('stream');
var async      = require('async');
var util       = require('util');
var _          = require('underscore');
var Q          = require('q');
var constants  = require('./app/lib/constants');
var fileDAL  = require('./app/lib/dal/fileDAL');
var jsonpckg   = require('./package.json');
var router      = require('./app/lib/streams/router');
var multicaster = require('./app/lib/streams/multicaster');
var INNER_WRITE = true;


function Server (dbConf, overrideConf, interceptors, onInit) {

  stream.Duplex.call(this, { objectMode: true });

  var logger = require('./app/lib/logger')('server');
  var that = this;
  var server4, server6;
  that.conn = null;
  that.conf = null;
  that.dal = null;
  that.version = jsonpckg.version;

  var initFunctions = [
    function (done) {
      that.connect(function (err) {
        done(err);
      });
    },
    function (done) {
      that.initServices(function (err) {
        done(err);
      });
    }
  ];

  var todoOnInit = initFunctions.concat(onInit || []).concat([
  ]);

  this._write = function (obj, enc, writeDone, isInnerWrite) {
    that.submit(obj, isInnerWrite, function (err, res) {
      if (isInnerWrite) {
        writeDone(err, res);
      } else {
        writeDone();
      }
    });
  };

  this.init = function (done) {
    return Q.Promise(function(resolve, reject){
      // Launches the server
      async.forEachSeries(todoOnInit, function(f, cb){
        f(cb);
      }, function(err) {
        done && done(err);
        err ? reject(err) : resolve();
      });
    });
  };

  this.submit = function (obj, isInnerWrite, done) {
    async.waterfall([
      function (next){
        var i = 0;
        var treatment = null;
        while (i < interceptors.length && !treatment) {
          if (interceptors[i].matches(obj)) {
            treatment = interceptors[i].treatment;
          }
          i++;
        }
        if (typeof treatment == 'function') {
          // Handle the incoming object
          treatment(that, obj, next);
        } else {
          var err = 'Unknown document type ' + JSON.stringify(obj);
          that.emit('error', Error(err));
          next(err);
        }
      }
    ], function (err, res) {
      if (err){
        switch (err) {
          case constants.ERROR.PUBKEY.ALREADY_UPDATED: err = 'Key already up-to-date'; break;
        }
        logger.debug(err);
      }
      if (res != null && res != undefined && !err) {
        // Only emit valid documents
        that.push(res);
      }
      if (isInnerWrite) {
        done(err, res);
      } else {
        done();
      }
    });
  };

  this.connect = function (done) {
    return Q.Promise(function(resolve, reject){
      // Init connection
      if (!that.dal) {
        var dbType = dbConf && dbConf.memory ? fileDAL.memory : fileDAL.file;
        dbType(dbConf.name || "default")
          .then(function(dal){
            that.dal = dal;
            return that.dal.initDabase();
          })
          .then(function() {
            return that.dal.loadConf();
          })
          .then(function(conf){
            that.conf = _(conf).extend(overrideConf || {});
            done();
          })
          .fail(function(err){
            done(err);
            reject(err);
          });
      }
      else {
        done();
        resolve();
      }
    });
  };

  this.start = function (done) {
    return Q.Promise(function(resolve, reject){
      async.waterfall([
        function (next){
          that._start(next);
        },
        function(next) {
          if (that.conf.routing) {
            var theRouter = that.router();
            var theCaster = multicaster(that.conf.isolate);
            that
              .pipe(theRouter) // The router asks for multicasting of documents
              .pipe(theCaster) // The multicaster may answer 'unreachable peer'
              .pipe(theRouter);
          }
          next();
        }
      ], function(err) {
        err ? reject(err) : resolve();
        done && done(err);
      });
    });
  };

  this._start = function (done) {
    // Method to override
    done();
  };

  this.stop = function () {
    logger.info('Shutting down server...');
    server4 && server4.close();
    server6 && server6.close();
    that.emit('stopped');
    logger.info('Server DOWN');
  };

  this.reset = function(done) {
    return that.dal.resetAll(done);
  };

  this.resetData = function(done) {
    return that.dal.resetData(done);
  };

  this.resetStats = function(done) {
    return that.dal.resetStats(done);
  };

  this.resetPeers = function(done) {
    return that.dal.resetPeers(done);
  };

  this.resetTxs = function(done) {
    that.dal.resetTransactions(done);
  };

  this.resetConf = function(done) {
    return that.dal.resetConf(done);
  };

  this.disconnect = function(done) {
    that.dal.close(function (err) {
      if(err)
        logger.error(err);
      if (typeof done == 'function')
        done(err);
    });
  };

  this.initServices = function(done) {
    if (!that.servicesInited) {
      that.servicesInited = true;
      that.HTTPService      = require("./app/service/HTTPService");
      that.MerkleService    = require("./app/service/MerkleService");
      that.ParametersService = require("./app/service/ParametersService")();
      that._initServices(that.conn, done);
    } else {
      done();
    }
  };

  this._initServices = function(conn, done) {
    // To override in child classes
    done();
  };

  this.singleWriteStream = function (onError) {
    return new TempStream(that, onError);
  };

  function TempStream (parentStream, onError) {

    stream.Duplex.call(this, { objectMode: true });

    var self = this;
    self._write = function (obj, enc, done) {
      parentStream._write(obj, enc, function (err, res) {
        if (err && typeof onError == 'function') onError(err);
        if (res) self.push(res);
        self.push(null);
        done();
      }, INNER_WRITE);
    };
    self._read = function () {
    };
  }

  var theRouter;

  this.router = function() {
    if (!theRouter) {
      theRouter = router(that.PeeringService.pubkey, that.conf, that.dal);
    }
    return theRouter;
  };

  util.inherits(TempStream, stream.Duplex);
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
