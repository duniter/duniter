var express = require('express');
var http    = require('http');
var path    = require('path');

module.exports = function(app_host, app_port, conf, autoStart) {

  var logsOut = [];

  require('log4js').configure({
    "appenders": [
      { type: __dirname + "/weblog", options: { output: logsOut } }
    ]
  });

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

  var adminApi = new (require('./admin'))(conf, conf.mdb, conf.mhost, conf.mport, logsOut);

  if(autoStart) {
    adminApi.doStart();
  }

  app.get('/node/start',     adminApi.start);
  app.get('/node/stop',      adminApi.stop);
  app.get('/node/status',    adminApi.status);
  app.get('/node/home',      adminApi.home);
  app.get('/node/logs',      adminApi.logs);

  http.createServer(app).listen(app_port, app_host, function(){
    console.log('Web interface: http://' + app_host + ':' + app_port);
  });
}