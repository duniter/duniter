
var ucoinApp = angular.module('ucoinApp', [
  'ngRoute',
  'ucoinControllers'
]);

var currency_acronym = "..";
var relative_acronym = "UD";

var routes = {
  'homeController': {
    model: 'partials/container.html',
    bodies: {
      '/home': 'home',
      '/graphs': 'currency-graphs',
      '/parameters': 'parameters',
      '/tech': 'tech'
    }
  },
  'communityController': {
    model: 'partials/container2.html',
    bodies: {
      '/community/members': 'community-members',
      '/community/voters': 'community-members',
      '/community/pks/lookup': 'community-lookup',
      '/community/pks/add': 'community-members',
      '/community/pks/udid2': 'community-udid2'
    }
  },
  'contractController': {
    model: 'partials/container.html',
    bodies: {
      '/blockchain/graphs': 'blockchain-graphs',
      '/blockchain/wotgraphs': 'blockchain-wotgraphs',
      '/blockchain/txgraphs': 'blockchain-txgraphs',
      '/contract/current': 'contract-current',
      '/contract/pending': 'contract-current',
      '/contract/votes': 'contract-votes'
    }
  },
  'transactionsController': {
    model: 'partials/container.html',
    bodies: {
      '/transactions/lasts': 'transactions-lasts'
    }
  },
  'peersController': {
    model: 'partials/container2.html',
    bodies: {
      '/peering/peers': 'peering-peers',
      '/peering/wallets': 'peering-wallets',
      '/peering/upstream': 'peering-peers',
      '/peering/downstream': 'peering-peers'
    }
  }
};

ucoinApp.config(['$routeProvider',
  function($routeProvider) {
    $.each(routes, function(controllerName, controller){
      $.each(controller.bodies, function(bodyPath, bodyName){
        $routeProvider.when(bodyPath, {
          templateUrl: controller.model,
          controller: controllerName,
          path: bodyName
        });
      });
    });
    $routeProvider.
      otherwise({
        redirectTo: '/home'
      });
  }
]);

var ucoinControllers = angular.module('ucoinControllers', []);
var btnStart, btnStop, btnRestart;

ucoinControllers.factory('socket', function ($rootScope) {
  var socket = io();
  return {
    on: function (eventName, callback) {
      socket.on(eventName, function () {
        var args = arguments;
        $rootScope.$apply(function () {
          callback.apply(socket, args);
        });
      });
    },
    emit: function (eventName, data, callback) {
      socket.emit(eventName, data, function () {
        var args = arguments;
        $rootScope.$apply(function () {
          if (callback) {
            callback.apply(socket, args);
          }
        });
      })
    }
  };
});

ucoinControllers.controller('sidebarController', function ($scope, socket, $http) {

  $scope.nodeMessage = '';
  $scope.errorMessage = false;
  $scope.status = '';
  $scope.$watch('status', function() {
    $scope.isUP = $scope.status == 'UP';
  }, true);

  socket.on('connection', function(msg) {
    $scope.nodeMessage = 'Connected';
  });

  socket.on('status', function(status) {
    $scope.status = status;
  });

  socket.on('message', function(msg) {
    $scope.nodeMessage = msg;
  });

  socket.on('block', function(block) {
    if (block) {
      $scope.currentBlock = block.number;
    }
  });

  $scope.start = function() {
    getOrError($http.get('/node/start'), $scope);
  };

  $scope.stop = function() {
    getOrError($http.get('/node/stop'), $scope);
  };

  $scope.restart = function() {
    getOrError($http.get('/node/restart'), $scope);
  };

  $scope.reset = function() {
    getOrError($http.get('/node/reset'), $scope);
  };
});

ucoinControllers.controller('homeController', function ($scope, $route, $location, socket, $http, $timeout) {

  $scope.currency_acronym = currency_acronym;
  $scope.relative_acronym = relative_acronym;
  $scope.isNotLoading = true;
  $scope.currentBlock = 'No blockchain';
  $scope.status = 'DOWN';
  $scope.isUP = false;
  $scope.logs = [];

  var memoryMainSeries, cpuMainSeries, memoryForkSeries, cpuForkSeries;
  setTimeout(function() {
    var now = new Date().getTime();
    var values = [];
    for (var i = 20; i > 0; i--) {
      values.push([now - i*1000, 0]);
    }
    memoryMainSeries = memoryGraph('#memoryGraph1', values);
    memoryForkSeries = memoryGraph('#memoryGraph2', values);
    cpuMainSeries = cpuGraph('#cpuGraph1', values);
    cpuForkSeries = cpuGraph('#cpuGraph2', values);
  }, 500);

  getOrError($http.get('/node/graphs')
    .success(function(data){
      $timeout(function() {
        var minSpeeds = [], speeds = [], maxSpeeds = [], actualDurations = [], maxDurations = [], minDurations = [];
        var BY_HOUR = 3600;
        data.speed.forEach(function (actualDuration, index) {
          var realDuration = !isNaN(actualDuration) && actualDuration != 0 ? actualDuration : data.parameters.avgGenTime;
          speeds.push(parseFloat((BY_HOUR/realDuration).toFixed(2)));
          minSpeeds.push(parseFloat((BY_HOUR/(data.parameters.avgGenTime*4)).toFixed(2)));
          maxSpeeds.push(parseFloat((BY_HOUR/(data.parameters.avgGenTime/4)).toFixed(2)));
          actualDurations.push(parseFloat((realDuration).toFixed(2)));
          minDurations.push(parseFloat(((data.parameters.avgGenTime/4)).toFixed(2)));
          maxDurations.push(parseFloat(((data.parameters.avgGenTime*4)).toFixed(2)));
        });
        var times = [];
        data.medianTimes.forEach(function (mdT, index) {
          times.push([index*1000, BY_HOUR*data.speed[index]]);
        });
        timeGraphs('#timeGraph', data.accelerations, data.medianTimeIncrements, actualDurations, minDurations, maxDurations);
        //speedGraphs('#speedGraph', speeds, minSpeeds, maxSpeeds);
        //issuersGraphs('#issuersGraph', data.nbDifferentIssuers, data.parameters);
        //difficultyGraph('#difficultyGraph', data.difficulties);

        //// Comboboxes
        //var textField1 = $("#textFieldBlock1");
        //var textField2 = $("#textFieldBlock2");
        //var last1Button = $("#buttonLast1");
        //var last2Button = $("#buttonLast2");
        //var allButton = $("#buttonAll");
        //var buttons = [300, 100, 50, 30, 10];
        //for (var i = 0; i < buttons.length; i++) {
        //  (function() {
        //    var btn = $("#buttonLast" + i);
        //    var num = buttons[i];
        //    btn.text(num + ' lasts');
        //    btn.click(function () {
        //      textField1.val(Math.max(0, data.speed.length - num));
        //      textField2.val(data.speed.length - 1);
        //      textField2.trigger('change');
        //    });
        //  })();
        //};
        //allButton.click(function () {
        //  textField1.val(0);
        //  textField2.val(data.speed.length - 1);
        //  textField2.trigger('change');
        //});
        //textField1.change(majGraphes);
        //textField2.change(majGraphes);
        //$("#buttonLast2").trigger('click');
        //
        //function majGraphes () {
        //  $("#timeGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
        //  $("#speedGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
        //  $("#issuersGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
        //  $("#difficultyGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
        //}
      }, 500);
    }), $scope);

  socket.on('overview', function(data) {
    if (data) {
      $.each(data, function (key, value) {
        $scope[key] = value;
      });
      $scope.Mformat = numeral($scope.M).format('0,0');
      $scope.MUDformat = numeral(data.M / data.UD).format('0,0.00');
      $scope.UDformat = numeral(data.UD).format('0,0');
      $scope.Tformat = moment(data.T).format('YYYY-MM-DD hh:mm:ss');
    }
  });

  var seriesLength = 0;
  socket.on('usage', function(data) {
    if (memoryMainSeries) {
      seriesLength++;
      var now = new Date().getTime();
      var MB = 1024*1024;
      memoryMainSeries.addPoint([now, data.main.memory/MB], true, true);
      memoryForkSeries.addPoint([now, data.fork.memory/MB], true, true);
      cpuMainSeries.addPoint([now, data.main.cpu], true, true);
      cpuForkSeries.addPoint([now, data.fork.cpu], true, true);
    }
  });

  socket.on('log', function(log) {
    var date = log.match(/^\[([\d-:. ]+)\]/)[1];
    var type = log.match(/^\[.*\] \[([\w]+)\]/)[1];
    var source = log.match(/^\[.*\] \[[\w]+\] (\w+) -/)[1];
    var message = log.match(/^\[.*\] \[[\w]+\] \w+ - (.*)/)[1];
    $scope.logs.push({
      date: date,
      type: type,
      source: source,
      message: message
    });
    if($scope.logs.length >= 10) {
      $scope.logs.splice(0, 1);
    }
  });

  $scope.path = ($route.current && $route.current.path) || "";
  $scope.menus = [{
    title: 'Overview',
    icon: 'picture',
    href: '#/home'
  },{
    title: 'Currency graphs',
    icon: 'stats',
    href: '#/graphs'
  },{
    title: 'Parameters',
    icon: 'wrench',
    href: '#/parameters'
  },{
    title: 'Peer informations',
    icon: 'globe',
    href: '#/tech'
  }];

  $scope.selectedIndex = [
    '/home',
    '/graphs',
    '/parameters',
    '/tech',
  ].indexOf($location.path());

  $scope.home = true;
});

function getOrError(jsonPromise, $scope) {
  return jsonPromise
    .error(handleError($scope));
}

function handleError($scope) {
  return function(err) {
    $scope.nodeMessage = (err && (err.message || err) || '');
    $scope.errorMessage = $scope.nodeMessage ? true : false;
  };
}

ucoinControllers.controller('communityController', function ($scope, $route, $location, $http, $timeout) {

  $scope.currency_acronym = currency_acronym;
  $scope.relative_acronym = relative_acronym;
  var forMenus = {
    '/community/members':    { menuIndex: 0, subIndex: 0 },
    '/community/voters':     { menuIndex: 0, subIndex: 1 },
    '/community/pks/lookup': { menuIndex: 1, subIndex: 0 },
    '/community/pks/add':    { menuIndex: 1, subIndex: 1 },
    '/community/pks/udid2':  { menuIndex: 1, subIndex: 1 }
  }
  $scope.selectedParentIndex = forMenus[$location.path()].menuIndex;
  $scope.selectedIndex = forMenus[$location.path()].subIndex;
  $scope.community = true;

  if (~['/community/members',
        '/community/voters',
        '/community/pks/lookup'].indexOf($location.path())) {
    $http.get($location.path()).success(function (data) {
      console.log(data);
      $.each(data, function (key, value) {
        $scope[key] = value;
      });

      if ($location.path() == '/community/pks/lookup') {
        $timeout(function () {
          $scope.isNotLoading = true;
          wotGraph('#wot', data.links);
        }, 500);
      }
      else if ($location.path() == '/community/members') {
        $timeout(function () {
          // 1. Remove imports to non-members
          var sources = [];
          data.wot.forEach(function (source) {
            sources.push(source.name);
          });
          data.wot.forEach(function (source) {
            var existing = [];
            source.imports.forEach(function (imp) {
              if (~sources.indexOf(imp))
                existing.push(imp);
            });
            source.imports = existing;
          });
          var bidirectionnals = {};
          data.wot.forEach(function (source) {
            data.wot.forEach(function (target) {
              if (~target.imports.indexOf(source.name) && ~source.imports.indexOf(target.name)) {
                bidirectionnals[source.name] = bidirectionnals[source.name] || [];
                bidirectionnals[source.name].push(target.name);
              }
            });
          });
          $scope.isNotLoading = true;
          wotGraph2('#wot2', data.wot, bidirectionnals);
        }, 500);
      }
      else {
        $scope.isNotLoading = true;
      }
    });
  } else {
    $scope.isNotLoading = true;
  }
  
  $scope.path = $route.current.path;

  $scope.menus = [{
    title: 'Members',
    submenus: [{
      title: 'Members',
      icon: 'user',
      href: '#/community/members'
    }
    // ,{
    //   title: 'Voters',
    //   icon: 'user',
    //   href: '#/community/voters'
    // }
    ]
  }
  // ,{
  //   title: 'Public keys',
  //   submenus: [{
  //     title: 'Lookup',
  //     icon: 'search',
  //     href: '#/community/pks/lookup'
  //   },{
  //     title: 'Generate udid2',
  //     icon: 'barcode',
  //     href: '#/community/pks/udid2'
  //   }]
  // }
  ];
});

ucoinControllers.controller('contractController', function ($scope, $route, $location, $http, $timeout) {

  $scope.currency_acronym = currency_acronym;
  $scope.relative_acronym = relative_acronym;
  $scope.selectedIndex = [
    '/blockchain/graphs',
    '/blockchain/wotgraphs',
    '/blockchain/txgraphs',
    '/contract/current',
    '/contract/pending',
    '/contract/votes'
  ].indexOf($location.path());

  if (~['/blockchain/graphs',
        '/blockchain/wotgraphs',
        '/blockchain/txgraphs',
        '/contract/current',
        '/contract/pending',
        '/contract/votes'].indexOf($location.path())) {
    $http.get($location.path()).success(function (data) {
      console.log(data);

      $scope.blockchainTime = moment($scope.blockchainTime*1000).format('LLL');

      $timeout(function() {
        if (~['/blockchain/graphs'].indexOf($location.path())) {
          var minSpeeds = [], speeds = [], maxSpeeds = [], actualDurations = [], maxDurations = [], minDurations = [];
          var BY_HOUR = 3600;
          data.speed.forEach(function (actualDuration, index) {
            var realDuration = !isNaN(actualDuration) && actualDuration != 0 ? actualDuration : data.parameters.avgGenTime;
            speeds.push(parseFloat((BY_HOUR/realDuration).toFixed(2)));
            minSpeeds.push(parseFloat((BY_HOUR/(data.parameters.avgGenTime*4)).toFixed(2)));
            maxSpeeds.push(parseFloat((BY_HOUR/(data.parameters.avgGenTime/4)).toFixed(2)));
            actualDurations.push(parseFloat((realDuration).toFixed(2)));
            minDurations.push(parseFloat(((data.parameters.avgGenTime/4)).toFixed(2)));
            maxDurations.push(parseFloat(((data.parameters.avgGenTime*4)).toFixed(2)));
          });
          var times = [];
          data.medianTimes.forEach(function (mdT, index) {
            times.push([index*1000, BY_HOUR*data.speed[index]]);
          });
          timeGraphs('#timeGraph', data.accelerations, data.medianTimeIncrements, actualDurations, minDurations, maxDurations);
          speedGraphs('#speedGraph', speeds, minSpeeds, maxSpeeds);
          issuersGraphs('#issuersGraph', data.nbDifferentIssuers, data.parameters);
          difficultyGraph('#difficultyGraph', data.difficulties);

          // Comboboxes
          var textField1 = $("#textFieldBlock1");
          var textField2 = $("#textFieldBlock2");
          var last1Button = $("#buttonLast1");
          var last2Button = $("#buttonLast2");
          var allButton = $("#buttonAll");
          var buttons = [300, 100, 50, 30, 10];
          for (var i = 0; i < buttons.length; i++) {
            (function() {
              var btn = $("#buttonLast" + i);
              var num = buttons[i];
              btn.text(num + ' lasts');
              btn.click(function () {
                textField1.val(Math.max(0, data.speed.length - num));
                textField2.val(data.speed.length - 1);
                textField2.trigger('change');
              });
            })();
          };
          allButton.click(function () {
            textField1.val(0);
            textField2.val(data.speed.length - 1);
            textField2.trigger('change');
          });
          textField1.change(majGraphes);
          textField2.change(majGraphes);
          $("#buttonLast2").trigger('click');

          function majGraphes () {
            $("#timeGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
            $("#speedGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
            $("#issuersGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
            $("#difficultyGraph").highcharts().xAxis[0].setExtremes(parseFloat(textField1.val()), parseFloat(textField2.val()));
          }
        }
        if (~['/blockchain/wotgraphs'].indexOf($location.path())) {
          wotGraphs('#wotGraph', data.members, data.newcomers, data.actives, data.leavers, data.excluded);
          certsGraph('#certsGraph', data.certifications);
        }
        if (~['/blockchain/txgraphs'].indexOf($location.path())) {
          txsGraphs('#txsGraph', data.transactions);
          outputVolumeGraph('#outputVolumeGraph', data.outputs, data.outputsEstimated);
        }
        $scope.isNotLoading = true;
        // estimatedOutputVolumeGraph('#estimatedOutputVolumeGraph', data.outputsEstimated);
      }, 500);
    });
  }
  
  $scope.path = $route.current.path;
  $scope.menus = [{
    title: 'Technical graphs',
    icon: 'stats',
    href: '#/blockchain/graphs'
  },{
    title: 'WoT graphs',
    icon: 'globe',
    href: '#/blockchain/wotgraphs'
  },{
    title: 'Transactions graphs',
    icon: 'transfer',
    href: '#/blockchain/txgraphs'
  }
  // ,{
  //   title: 'Current',
  //   icon: 'list-alt',
  //   href: '#/contract/current'
  // },{
  //   title: 'Pending',
  //   icon: 'time',
  //   href: '#/contract/pending'
  // },{
  //   title: 'Votes',
  //   icon: 'envelope',
  //   href: '#/contract/votes'
  // }
  ];
  $scope.contract = true;

  if($location.path() == "/contract/current") {
    $scope.errorMessage = "Contract is currently empty!";
    $scope.errorAddition = "it will be initialized once a vote is received.";
  }

  if($location.path() == "/contract/pending") {
    $scope.errorMessage = "This node is not proposing any amendment!";
    $scope.errorAddition = "";
  }
});

ucoinControllers.controller('transactionsController', function ($scope, $route, $location, $http) {

  $scope.currency_acronym = currency_acronym;
  $scope.relative_acronym = relative_acronym;
  $scope.selectedIndex = [
    '/transactions/lasts'
  ].indexOf($location.path());

  if (~['/transactions/lasts'].indexOf($location.path())) {
    $http.get($location.path()).success(function (data) {
      console.log(data);
      $.each(data, function (key, value) {
        $scope[key] = value;
      });

      $scope.transactions.forEach(function(tx){
        tx.coins.forEach(function(coin, index){
          var split = coin.split(':');
          tx.coins[index] = {
            id: split[0],
            tx: split[1]
          };
        });
      });

      $scope.isNotLoading = true;
    });
  }
  
  $scope.path = $route.current.path;
  $scope.menus = [{
    title: 'Last received',
    icon: 'fire',
    href: '#/transactions/lasts'
  }];
  $scope.transaction = true;
  $scope.errorMessage = "No transactions received yet!";
});

ucoinControllers.controller('peersController', function ($scope, $route, $location, $http) {

  $scope.currency_acronym = currency_acronym;
  $scope.relative_acronym = relative_acronym;
  var forMenus = {
    '/peering/peers':      { menuIndex: 0, subIndex: 0 },
    '/peering/wallets':    { menuIndex: 0, subIndex: 1 },
    '/peering/upstream':   { menuIndex: 1, subIndex: 0 },
    '/peering/downstream': { menuIndex: 1, subIndex: 1 },
  }
  $scope.selectedParentIndex = forMenus[$location.path()].menuIndex;
  $scope.selectedIndex = forMenus[$location.path()].subIndex;

  if (~['/peering/peers',
        '/peering/wallets',
        '/peering/upstream',
        '/peering/downstream'].indexOf($location.path())) {
    $http.get($location.path()).success(function (data) {
      console.log(data);
      $.each(data, function (key, value) {
        $scope[key] = value;
      })

      $scope.peers && $scope.peers.forEach(function(p){
        p.keyID = '0x' + p.fingerprint.substring(24);
      });

      $scope.wallets && $scope.wallets.forEach(function(w){
        w.keyID = '0x' + w.fingerprint.substring(24);
      });

      $scope.isNotLoading = true;
    });
  }
  
  $scope.path = $route.current.path;
  $scope.menus = [{
    title: 'Peering',
    submenus: [{
      title: 'Known peers',
      icon: 'globe',
      href: '#/peering/peers'
    },{
      title: 'Wallets',
      icon: 'lock',
      href: '#/peering/wallets'
    }]
  },{
    title: 'Routing',
    submenus: [{
      title: 'Upstream (incoming data)',
      icon: 'cloud-download',
      href: '#/peering/upstream'
    },{
      title: 'Downstream (outcoming data)',
      icon: 'cloud-download',
      href: '#/peering/downstream'
    }]
  }];
  $scope.isPeers = true;
});

function dashboardJS() {
  /*
   * Author: Abdullah A Almsaeed
   * Date: 4 Jan 2014
   * Description:
   *      This is a demo file used only for the main dashboard (index.html)
   **/

  $(function() {
    "use strict";

    //Make the dashboard widgets sortable Using jquery UI
    $(".connectedSortable").sortable({
      placeholder: "sort-highlight",
      connectWith: ".connectedSortable",
      handle: ".box-header, .nav-tabs",
      forcePlaceholderSize: true,
      zIndex: 999999
    }).disableSelection();
    $(".connectedSortable .box-header, .connectedSortable .nav-tabs-custom").css("cursor", "move");
    //jQuery UI sortable for the todo list
    $(".todo-list").sortable({
      placeholder: "sort-highlight",
      handle: ".handle",
      forcePlaceholderSize: true,
      zIndex: 999999
    }).disableSelection();
    ;

    //bootstrap WYSIHTML5 - text editor
    $(".textarea").wysihtml5();

    $('.daterange').daterangepicker(
      {
        ranges: {
          'Today': [moment(), moment()],
          'Yesterday': [moment().subtract('days', 1), moment().subtract('days', 1)],
          'Last 7 Days': [moment().subtract('days', 6), moment()],
          'Last 30 Days': [moment().subtract('days', 29), moment()],
          'This Month': [moment().startOf('month'), moment().endOf('month')],
          'Last Month': [moment().subtract('month', 1).startOf('month'), moment().subtract('month', 1).endOf('month')]
        },
        startDate: moment().subtract('days', 29),
        endDate: moment()
      },
      function(start, end) {
        alert("You chose: " + start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
      });

    /* jQueryKnob */
    $(".knob").knob();

    //jvectormap data
    var visitorsData = {
      "US": 398, //USA
      "SA": 400, //Saudi Arabia
      "CA": 1000, //Canada
      "DE": 500, //Germany
      "FR": 760, //France
      "CN": 300, //China
      "AU": 700, //Australia
      "BR": 600, //Brazil
      "IN": 800, //India
      "GB": 320, //Great Britain
      "RU": 3000 //Russia
    };
    //World map by jvectormap
    $('#world-map').vectorMap({
      map: 'world_mill_en',
      backgroundColor: "transparent",
      regionStyle: {
        initial: {
          fill: '#e4e4e4',
          "fill-opacity": 1,
          stroke: 'none',
          "stroke-width": 0,
          "stroke-opacity": 1
        }
      },
      series: {
        regions: [{
          values: visitorsData,
          scale: ["#92c1dc", "#ebf4f9"],
          normalizeFunction: 'polynomial'
        }]
      },
      onRegionLabelShow: function(e, el, code) {
        if (typeof visitorsData[code] != "undefined")
          el.html(el.html() + ': ' + visitorsData[code] + ' new visitors');
      }
    });

    //Sparkline charts
    var myvalues = [1000, 1200, 920, 927, 931, 1027, 819, 930, 1021];
    $('#sparkline-1').sparkline(myvalues, {
      type: 'line',
      lineColor: '#92c1dc',
      fillColor: "#ebf4f9",
      height: '50',
      width: '80'
    });
    myvalues = [515, 519, 520, 522, 652, 810, 370, 627, 319, 630, 921];
    $('#sparkline-2').sparkline(myvalues, {
      type: 'line',
      lineColor: '#92c1dc',
      fillColor: "#ebf4f9",
      height: '50',
      width: '80'
    });
    myvalues = [15, 19, 20, 22, 33, 27, 31, 27, 19, 30, 21];
    $('#sparkline-3').sparkline(myvalues, {
      type: 'line',
      lineColor: '#92c1dc',
      fillColor: "#ebf4f9",
      height: '50',
      width: '80'
    });

    //The Calender
    $("#calendar").datepicker();

    //SLIMSCROLL FOR CHAT WIDGET
    $('#chat-box').slimScroll({
      height: '250px'
    });

    /* Morris.js Charts */
    // Sales chart
    var area = new Morris.Area({
      element: 'revenue-chart',
      resize: true,
      data: [
        {y: '2011 Q1', item1: 2666, item2: 2666},
        {y: '2011 Q2', item1: 2778, item2: 2294},
        {y: '2011 Q3', item1: 4912, item2: 1969},
        {y: '2011 Q4', item1: 3767, item2: 3597},
        {y: '2012 Q1', item1: 6810, item2: 1914},
        {y: '2012 Q2', item1: 5670, item2: 4293},
        {y: '2012 Q3', item1: 4820, item2: 3795},
        {y: '2012 Q4', item1: 15073, item2: 5967},
        {y: '2013 Q1', item1: 10687, item2: 4460},
        {y: '2013 Q2', item1: 8432, item2: 5713}
      ],
      xkey: 'y',
      ykeys: ['item1', 'item2'],
      labels: ['Item 1', 'Item 2'],
      lineColors: ['#a0d0e0', '#3c8dbc'],
      hideHover: 'auto'
    });
    var line = new Morris.Line({
      element: 'line-chart',
      resize: true,
      data: [
        {y: '2011 Q1', item1: 2666},
        {y: '2011 Q2', item1: 2778},
        {y: '2011 Q3', item1: 4912},
        {y: '2011 Q4', item1: 3767},
        {y: '2012 Q1', item1: 6810},
        {y: '2012 Q2', item1: 5670},
        {y: '2012 Q3', item1: 4820},
        {y: '2012 Q4', item1: 15073},
        {y: '2013 Q1', item1: 10687},
        {y: '2013 Q2', item1: 8432}
      ],
      xkey: 'y',
      ykeys: ['item1'],
      labels: ['Item 1'],
      lineColors: ['#efefef'],
      lineWidth: 2,
      hideHover: 'auto',
      gridTextColor: "#fff",
      gridStrokeWidth: 0.4,
      pointSize: 4,
      pointStrokeColors: ["#efefef"],
      gridLineColor: "#efefef",
      gridTextFamily: "Open Sans",
      gridTextSize: 10
    });

    //Donut Chart
    var donut = new Morris.Donut({
      element: 'sales-chart',
      resize: true,
      colors: ["#3c8dbc", "#f56954", "#00a65a"],
      data: [
        {label: "Download Sales", value: 12},
        {label: "In-Store Sales", value: 30},
        {label: "Mail-Order Sales", value: 20}
      ],
      hideHover: 'auto'
    });
    /*Bar chart
     var bar = new Morris.Bar({
     element: 'bar-chart',
     resize: true,
     data: [
     {y: '2006', a: 100, b: 90},
     {y: '2007', a: 75, b: 65},
     {y: '2008', a: 50, b: 40},
     {y: '2009', a: 75, b: 65},
     {y: '2010', a: 50, b: 40},
     {y: '2011', a: 75, b: 65},
     {y: '2012', a: 100, b: 90}
     ],
     barColors: ['#00a65a', '#f56954'],
     xkey: 'y',
     ykeys: ['a', 'b'],
     labels: ['CPU', 'DISK'],
     hideHover: 'auto'
     });*/
    //Fix for charts under tabs
    $('.box ul.nav a').on('shown.bs.tab', function(e) {
      area.redraw();
      donut.redraw();
    });


    /* BOX REFRESH PLUGIN EXAMPLE (usage with morris charts) */
    $("#loading-example").boxRefresh({
      source: "ajax/dashboard-boxrefresh-demo.php",
      onLoadDone: function(box) {
        bar = new Morris.Bar({
          element: 'bar-chart',
          resize: true,
          data: [
            {y: '2006', a: 100, b: 90},
            {y: '2007', a: 75, b: 65},
            {y: '2008', a: 50, b: 40},
            {y: '2009', a: 75, b: 65},
            {y: '2010', a: 50, b: 40},
            {y: '2011', a: 75, b: 65},
            {y: '2012', a: 100, b: 90}
          ],
          barColors: ['#00a65a', '#f56954'],
          xkey: 'y',
          ykeys: ['a', 'b'],
          labels: ['CPU', 'DISK'],
          hideHover: 'auto'
        });
      }
    });

    /* The todo list plugin */
    $(".todo-list").todolist({
      onCheck: function(ele) {
        //console.log("The element has been checked")
      },
      onUncheck: function(ele) {
        //console.log("The element has been unchecked")
      }
    });

  });
}

function demoJS() {
  $(function() {
    /* For demo purposes */
    var demo = $("<div />").css({
      position: "fixed",
      top: "150px",
      right: "0",
      background: "rgba(0, 0, 0, 0.7)",
      "border-radius": "5px 0px 0px 5px",
      padding: "10px 15px",
      "font-size": "16px",
      "z-index": "999999",
      cursor: "pointer",
      color: "#ddd"
    }).html("<i class='fa fa-gear'></i>").addClass("no-print");

    var demo_settings = $("<div />").css({
      "padding": "10px",
      position: "fixed",
      top: "130px",
      right: "-200px",
      background: "#fff",
      border: "3px solid rgba(0, 0, 0, 0.7)",
      "width": "200px",
      "z-index": "999999"
    }).addClass("no-print");
    demo_settings.append(
      "<h4 style='margin: 0 0 5px 0; border-bottom: 1px dashed #ddd; padding-bottom: 3px;'>Layout Options</h4>"
      + "<div class='form-group no-margin'>"
      + "<div class='.checkbox'>"
      + "<label>"
      + "<input type='checkbox' onchange='change_layout();'/> "
      + "Fixed layout"
      + "</label>"
      + "</div>"
      + "</div>"
    );
    demo_settings.append(
      "<h4 style='margin: 0 0 5px 0; border-bottom: 1px dashed #ddd; padding-bottom: 3px;'>Skins</h4>"
      + "<div class='form-group no-margin'>"
      + "<div class='.radio'>"
      + "<label>"
      + "<input name='skins' type='radio' onchange='change_skin(\"skin-black\");' /> "
      + "Black"
      + "</label>"
      + "</div>"
      + "</div>"

      + "<div class='form-group no-margin'>"
      + "<div class='.radio'>"
      + "<label>"
      + "<input name='skins' type='radio' onchange='change_skin(\"skin-blue\");' checked='checked'/> "
      + "Blue"
      + "</label>"
      + "</div>"
      + "</div>"
    );

    demo.click(function() {
      if (!$(this).hasClass("open")) {
        $(this).css("right", "200px");
        demo_settings.css("right", "0");
        $(this).addClass("open");
      } else {
        $(this).css("right", "0");
        demo_settings.css("right", "-200px");
        $(this).removeClass("open")
      }
    });

    $("body").append(demo);
    $("body").append(demo_settings);
  });

  function change_layout() {
    $("body").toggleClass("fixed");
    fix_sidebar();
  }
  function change_skin(cls) {
    $("body").removeClass("skin-blue skin-black");
    $("body").addClass(cls);
  }

}