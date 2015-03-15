var fs         = require('fs');
var stream     = require('stream');
var async      = require('async');
var util       = require('util');
var _          = require('underscore');
var mongoose   = require('mongoose');
var common     = require('./app/lib/common');
var constants  = require('./app/lib/constants');
var sqliteDAL  = require('./app/lib/dal/sqliteDAL');
var express    = require('express');
var request    = require('request');
var http       = require('http');
var log4js     = require('log4js');
var upnp       = require('nat-upnp');
var jsonpckg   = require('./package.json');

var models = ['Identity', 'Certification', 'Configuration', 'Link', 'Merkle', 'Peer', 'Transaction', 'TxMemory', 'Membership', 'Block', 'Source', 'BlockStat'];
var INNER_WRITE = true;

function Server (dbConf, overrideConf, interceptors, onInit) {

  stream.Duplex.call(this, { objectMode : true });

  var logger  = require('./app/lib/logger')(dbConf.name);
  var that = this;
  var server4, server6;
  var serverListening = false;
  that.conn = null;
  that.conf = null;
  that.dal = null;
  that.version = jsonpckg.version;

  var initFunctions = [
    function (done) {
      that.connect(function (err) {
        that.emit('connected', err);
        done(err);
      });
    },
    function (done) {
      that.initServices(function (err) {
        that.emit('services');
        done(err);
      });
    }
  ];

  var todoOnInit = initFunctions.concat(onInit).concat([
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

  this.init = function () {
    // Launches the server
    async.forEachSeries(todoOnInit, function(f, cb){
      f(cb);
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
      },
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
  }

  this.connect = function (reset, done) {
    var databaseName = dbConf.name || "ucoin_default";
    var host = dbConf.host || "localhost";
    var port = dbConf.port;
    if (arguments.length == 1) {
      done = reset;
      reset = dbConf.resetData;
    }
    // Init connection
    if (!that.conn) {
      // bad parameters
      if(!host && !port && !done){
        throw new Error('Bad parameters for database connection');
      }
      // host and port not provided
      if(!done && !port){
        done = host;
        host = 'localhost';
        port = undefined;
      }
      // port not provided
      if(!done && !port){
        done = port;
        port = undefined;
      }
      host = host ? host : 'localhost';
      // logger.debug('Connecting to database `%s`', databaseName);
      var conn = that.conn = mongoose.createConnection('mongodb://' + host + (port ? ':' + port : '') + '/' + databaseName);
      conn.on('error', function (err) {
        logger.error(err);
        that.emit('mongoFail', err);
      });
      async.waterfall([
        function (next){
          conn.once('open', next);
        },
        function (next){
          models.forEach(function (entity) {
            conn.model(entity, require(__dirname + '/app/models/' + entity.toLowerCase() + '.js'));
          });
          conn.model('Configuration').find(next);
        },
        function (foundConf, next){
          var Configuration = conn.model('Configuration');
          that.conf = foundConf[0] || new Configuration();
          if (overrideConf) {
            _(overrideConf).keys().forEach(function(k){
              that.conf[k] = overrideConf[k];
            });
          }
          if (reset) {
            that.reset(next);
            return;
          }
          next();
        },
        function(next) {
          if(fs.existsSync(__dirname + '/' + dbConf.name))
            fs.unlinkSync(__dirname + '/' + dbConf.name);
          that.dal = sqliteDAL.memory(__dirname + '/' + dbConf.name);
          that.dal.initDabase().done(next);
        }
      ], done);
    }
    else {
      done();
    }
  };

  this.start = function (done) {
    async.waterfall([
      function (next){
        that._start(next);
      },
      function (next) {
        listenBMA(function (err, app) {
          if (!err) {
            that.emit('BMALoaded', app);
            that.emit('started');
          }
          else
            that.emit('BMAFailed', err);
          next(err);
        });
      }
    ], done);
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
    serverListening = false;
  };

  this.isListening = function () {
    return serverListening;
  };

  this.reset = function(done) {
    return that.dal.dropModel('peer').then(function() {
      that.resetDatas([
        'identities',
        'certifications',
        'blocks',
        'links',
        'sources',
        'merkles',
        'peers',
        'transactions',
        'blockstats',
        'txmemories',
        'memberships'
      ], done);
    }).fail(done);
  };

  this.resetStats = function(done) {
    that.resetDatas(['blockstats'], done);
  };

  this.resetPeers = function(done) {
    return that.dal.dropModel('peer').then(function() {
      that.resetDatas(['peers'], done);
    });
  };

  this.resetTxs = function(done) {
    that.resetDatas(['transactions'], done);
  };

  this.resetDatas = function(collections, done) {
    async.waterfall([
      function (next){
        that.connect(next);
      },
      function (next){
        async.forEachSeries(collections, function(collectionName, next){
          if (that.conn.collections[collectionName]) {
            that.conn.collections[collectionName].drop(function (err) {
              next();
            });
          } else {
            next();
          }
        }, function (err) {
          next(err);
        });
      }
    ], done);
  };

  this.resetConf = function(done) {
    async.waterfall([
      function (next){
        that.connect(next);
      },
      function (next){
        that.conn.model('Configuration').remove({}, function (err) {
          next(err);
        });
      },
    ], done);
  };

  this.disconnect = function(done) {
    that.conn.close(function (err) {
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
      that.ParametersService = require("./app/service/ParametersService").get(that.conn, that.conf.currency);
      that._initServices(that.conn, done);
    } else {
      done();
    }
  };

  this._initServices = function(conn) {
    // To override in child classes
  };

  this.initUPnP = function (conn, conf, done) {
    logger.info('Configuring UPnP...');
    var client = upnp.createClient();
    async.waterfall([
      function (next) {
        client.externalIp(function(err, ip) {
          if (err && err.message == 'timeout') {
            err = 'No UPnP gateway found: your node won\'t be reachable from the Internet. Use --noupnp option to avoid this message.';
          }
          next(err, ip);
        });
      },
      function (ip, next) {
        // Update UPnP IGD every INTERVAL seconds
        setInterval(async.apply(openPort, conf, client), 1000*constants.NETWORK.UPNP.INTERVAL);
        openPort(conf, client, next);
      }
    ], done);
  };

  function openPort (conf, client, done) {
    client.portMapping({
      public: conf.remoteport,
      private: conf.port,
      ttl: constants.NETWORK.UPNP.TTL
    }, function(err) {
      return done && done(err);
    });
  }

  function listenBMA (overConf, onLoaded) {
    if (arguments.length == 1) {
      onLoaded = overConf;
      overConf = undefined;
    }
    var app = express();
    var conf = _.extend(that.conf, overConf || {});
    var port = process.env.PORT || conf.port;

    // all environments
    app.set('port', port);
    if (conf.httplogs) {
      app.use(log4js.connectLogger(logger, {
        level: 'debug',
        format: '\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m'
      }));
    }
    app.use(express.urlencoded());
    app.use(express.json());
    async.waterfall([
      function (next){

        // Routing
        app.use(app.router);

        // development only
        if ('development' == app.get('env')) {
          app.use(express.errorHandler());
        }
        next();
      },
      function (next) {
        // Listen to interfaces
        that._listenBMA(app);
        next();
      },
      function (next){
        if (conf.upnp) {
          that.initUPnP(that.conn, conf, next);
        }
        else next();
      },
      function (next) {
        if(conf.ipv4){
          server4 = http.createServer(app);
          serverListening = true;
          server4.listen(conf.port, conf.ipv4, function(){
            logger.info('uCoin server listening on ' + conf.ipv4 + ' port ' + conf.port);
            next();
          });
        }
        else next();
      },
      function (next) {
        if(conf.ipv6){
          server6 = http.createServer(app);
          serverListening = true;
          server6.createServer(app).listen(conf.port, conf.ipv6, function(){
            logger.info('uCoin server listening on ' + conf.ipv6 + ' port ' + conf.port);
            next();
          });
        }
        else next();
      },
      function(next) {
        logger.info('External access:', [conf.remoteipv4, conf.remoteport].join(':'));
        next();
      }
    ], function (err) {
      if (typeof onLoaded == 'function')
        onLoaded.call(that, err, app);
    });
  };

  this._listenBMA = function (app) {
    this.listenNode(app);
  };

  this.listenNode= function (app) {
    var node = require('./app/controllers/node')(that);
    app.get( '/node/summary',  node.summary);
  };

  this.singleWriteStream = function (onError) {
    return new TempStream(that, onError);
  };

  function TempStream (parentStream, onError) {

    stream.Duplex.call(this, { objectMode : true });

    var self = this;
    this._write = function (obj, enc, done) {
      parentStream._write(obj, enc, function (err, res) {
        if (err && typeof onError == 'function') onError(err);
        if (res) self.push(res);
        self.push(null);
        done();
      }, INNER_WRITE);
    };
    this._read = function () {
    }
  }

  util.inherits(TempStream, stream.Duplex);
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
