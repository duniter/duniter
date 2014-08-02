var stream     = require('stream');
var async      = require('async');
var util       = require('util');
var _          = require('underscore');
var mongoose   = require('mongoose');
var common     = require('./app/lib/common');
var express    = require('express');
var request    = require('request');
var http       = require('http');
var log4js     = require('log4js');
var connectPgp = require('connect-pgp');

var models = ['Amendment', 'Coin', 'Configuration', 'Forward', 'Key', 'CKey', 'Merkle', 'Peer', 'PublicKey', 'Wallet', 'Transaction', 'TxMemory', 'Membership', 'KeyBlock'];
var INNER_WRITE = true;

function Server (dbConf, overrideConf, interceptors, onInit) {

  stream.Duplex.call(this, { objectMode : true });

  var logger  = require('./app/lib/logger')(dbConf.name);
  var that = this;
  that.conn = null;
  that.conf = null;

  var initFunctions = [
    function (done) {
      that.connect(function (err) {
        that.emit('connected', err);
        done(err);
      });
    },
    function (done) {
      that.initServices(function (err) {
        that.emit('services', err);
        done(err);
      });
    }
  ];

  var todoOnInit = initFunctions.concat(onInit).concat([
    function (done) {
      if (dbConf.listenBMA) {
        listenBMA(function (err, app) {
          that.emit('BMALoaded', err, app);
          done();
        });
      } else done();
    }
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
        logger.debug(err);
      }
      if (res != null && res != undefined) {
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
        logger.error('connection error:', err);
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
      ], done);
    }
    else {
      done();
    }
  };

  this.reset = function(done) {
    async.waterfall([
      function (next){
        that.connect(next);
      },
      function (next){
        var deletableCollections = [
          'amendments',
          'coins',
          'forwards',
          'keys',
          'ckeys',
          'merkles',
          'peers',
          'publickeys',
          'wallets',
          'transactions',
          'txmemories',
          'memberships'];
        async.forEachSeries(deletableCollections, function(collection, next){
          if (that.conn.collections[collection]) {
            that.conn.collections[collection].drop(function (err) {
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

  this._sign = null;

  function listenBMA (overConf, onLoaded) {
    if (arguments.length == 1) {
      onLoaded = overConf;
      overConf = undefined;
    }
    var app = express();
    var conf = _.extend(that.conf, overConf || {});
    var port = process.env.PORT || conf.port;
    var currency = conf.currency;

    // all environments
    app.set('port', port);
    app.use(log4js.connectLogger(logger, { level: 'auto', format: '\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m' }));
    app.use(express.urlencoded());
    app.use(express.json());
    async.waterfall([
      function (next){

        if (that._sign) {
          // HTTP Signatures
          app.use(connectPgp(that.sign));
          logger.debug('Signed requests with PGP: enabled.');
        }

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
      function (next) {
        if(conf.ipv4){
          logger.info('Connecting on interface %s:%s...', conf.ipv4, conf.port);
          http.createServer(app).listen(conf.port, conf.ipv4, function(){
            logger.info('uCoin server listening on ' + conf.ipv4 + ' port ' + conf.port);
            next();
          });
        }
        else next();
      },
      function (next) {
        if(conf.ipv6){
          logger.info('Connecting on interface %s:%s...', conf.ipv6, conf.port);
          http.createServer(app).listen(conf.port, conf.ipv6, function(){
            logger.info('uCoin server listening on ' + conf.ipv6 + ' port ' + conf.port);
            next();
          });
        }
        else next();
      },
    ], function (err) {
      if (typeof onLoaded == 'function')
        onLoaded.call(that, err, app);
    });
  };

  this._listenBMA = function (app) {
    this.listenPKS(app);
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

  // Launches the server
  async.forEachSeries(todoOnInit, function(f, cb){
    f(cb);
  });
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
