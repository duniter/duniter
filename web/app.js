var express = require('express');
var http    = require('http');
var path    = require('path');
var es      = require('event-stream');
var usage   = require('usage');
var Q       = require('q');
var logger  = require('../app/lib/logger')('webapp');

/**
 * Creates a new ucoin application instance. Runs over a network interface + port, accessible over Web Browser.
 * @param app_host The network interface on which is bound the app.
 * @param app_port The port on which is bound the app.
 * @param cliConf The configuration given by the CLI (options).
 * @param autoStart If set to true, directly start the instance process.
 */
module.exports = function(app_host, app_port, cliConf, autoStart) {

  /******************
   *   WEB ADMIN
   *****************/
  var app = express();
  app.set("view options", {layout: false});
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(app.router);

  // development only
  if ('development' == app.get('env')) {
    app.use(express.errorHandler());
  }

  // Override some defaults
  cliConf.httplogs = false;

  /******************
   *  HTTP CONTROL
   *****************/
  var adminApi = new (require('./admin'))(cliConf, cliConf.mdb, autoStart);
  app.get('/node/start',     doAction(adminApi.start));
  app.get('/node/stop',      doAction(adminApi.stop));
  app.get('/node/restart',   doAction(adminApi.restart));
  app.get('/node/reset',     doAction(adminApi.reset));
  app.get('/node/graphs',    doAction(adminApi.graphs));

  var server = http.createServer(app).listen(app_port, app_host, function(){
    console.log('Web interface: http://' + app_host + ':' + app_port);
  });

  /******************
   * EVENTS OF DATA
   *****************/

  var io = require('socket.io').listen(server);

  // Errors, new status, new block
  adminApi.pipe(es.mapSync(function (data) {
    data.error      && io.sockets.emit('error', data.error);
    data.status     && io.sockets.emit('status', data.status);
    data.medianTime && io.sockets.emit('block', data);
  }));

  // CPU/Memory update
  setInterval(function() {
    Q.all([
        Q.nbind(adminApi.getPoWStats, adminApi)(),
        Q.nbind(usage.lookup, usage, process.pid, { keepHistory: true })()
      ])
      .spread(function(fork, main) {
        io.sockets.emit('usage', {
          main: { memory: main.memory, cpu: main.cpu },
          fork: { memory: fork.memory, cpu: fork.cpu }
        });
      })
      .fail(function(err){
        logger.error(err);
      });
  }, 2000);

  // Logs
  require('log4js').configure({
    "appenders": [{
        type: __dirname + "/weblog",
        options: {
          output: function(log) {
            io.sockets.emit('log', log);
          }
        }
      }
    ]
  });

  /**
   * When a new client connects, we send him the instance model (a.k.a state), i.e.:
   *   - its status (UP, DOWN, ...)
   *   - its current block number
   *   - its "overview" (data displayed on home: currency, graphs data, ...)
   */
  io.sockets.on('connection', function(socket) {
    console.log('New client');
    socket.emit('status',   adminApi.status);
    socket.emit('block',    adminApi.current);
    socket.emit('overview', adminApi.overview);
  })
};

function doAction(promiseCallback) {
  return function(req, res) {
    promiseCallback()
      .then(onSuccess(res))
      .fail(onError(res));
  }
}

function onSuccess(res) {
  return function(data) {
    res.type('application/json');
    res.send(JSON.stringify(data || {}));
  }
}

function onError(res) {
  return function(err) {
    res.type('application/json');
    res.send(500, JSON.stringify({ message: err.message || err }));
  }
}