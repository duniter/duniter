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
var logger     = require('./app/lib/logger')('server');

var models = ['Amendment', 'Coin', 'Configuration', 'Forward', 'Key', 'CKey', 'Merkle', 'Peer', 'PublicKey', 'Wallet', 'Transaction', 'Vote', 'TxMemory', 'Membership', 'Voting', 'CommunityFlow'];

function Server (dbConf, overrideConf, interceptors) {

  stream.Duplex.call(this, { objectMode : true });

  var that = this;
  that.conn = null;
  that.conf = null;

  this._write = function (obj, enc, done) {
    async.waterfall([
      async.apply(that.initServer.bind(that)),
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
    ], function (err) {
      if (err){
        logger.debug(err);
      }
      done();
    });
  };

  this.connect = function (reset, done) {
    var databaseName = dbConf.name || "ucoin_default";
    var host = dbConf.host || "localhost";
    var port = dbConf.port;
    if (arguments.length == 1) {
      done = reset;
      reset = false;
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
      logger.debug('Connecting to database %s', databaseName);
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
          'votes',
          'txmemories',
          'memberships',
          'votings',
          'communityflows'];
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
      this.HTTPService      = require("./app/service/HTTPService");
      this.MerkleService    = require("./app/service/MerkleService");
      this.ParametersService = require("./app/service/ParametersService").get(that.conn, that.conf.currency);
      this._initServices(that.conn, done);
    } else {
      done();
    }
  };

  this._initServices = function(conn) {
    // To override in child classes
  };

  this.listenBMA = function (overConf, onLoaded) {
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
      function (next) {
        that.initServer(next);
      },
      function (next){

        // HTTP Signatures
        app.use(connectPgp(that.sign));
        logger.debug('Signed requests with PGP: enabled.');

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

  this.listenPKS = function (app) {
    var pks = require('./app/controllers/pks')(this);
    app.get(  '/pks/all',    pks.getAll);
    app.get(  '/pks/lookup', pks.lookup);
    app.post( '/pks/add',    pks.add);
  };

  this.singleWriteStream = function () {
    return new TempStream(that);
  };

  function TempStream (parentStream) {

    stream.Duplex.call(this, { objectMode : true });

    this._write = function (obj, enc, done) {
      parentStream._write(obj, enc, done);
    };
  }

  util.inherits(TempStream, stream.Duplex);
}

util.inherits(Server, stream.Duplex);

module.exports = Server;
