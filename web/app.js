var express = require('express');
var http    = require('http');
var path    = require('path');
var es      = require('event-stream');
var usage   = require('usage');
var Q       = require('q');
var logger  = require('../app/lib/logger')('webapp');

module.exports = function(app_host, app_port, conf, autoStart) {

  var app = express();

// all environments
  app.set("view options", {layout: false});
  app.set('port', process.env.PORT || 3000);
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
  conf.httplogs = false;

  var adminApi = new (require('./admin'))(conf, conf.mdb, conf.mhost, conf.mport, autoStart);

  app.get('/node/start',     adminApi.start);
  app.get('/node/stop',      adminApi.stop);
  app.get('/node/restart',   adminApi.restart);
  app.get('/node/reset',     adminApi.reset);
  app.get('/node/graphs',    adminApi.graphs);

  var server = http.createServer(app).listen(app_port, app_host, function(){
    console.log('Web interface: http://' + app_host + ':' + app_port);
  });

  var io = require('socket.io').listen(server);

  adminApi.pipe(es.mapSync(function (data) {

    if (data.error) {
      io.sockets.emit('error', data.error);
    }
    else if (data.status) {
      io.sockets.emit('status', data.status);
    }
    else if (data.medianTime) {
      io.sockets.emit('block', data);
    }
  }));

  // CPU/Memory
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

  io.sockets.on('connection', function(socket) {
    console.log('New client');
    socket.emit('status',   adminApi.status);
    socket.emit('block',    adminApi.current);
    socket.emit('overview', adminApi.overview);
  })
}