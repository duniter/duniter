function memoryGraph (id, data) {
  var series;
  $(id).highcharts({
    chart: {
      type: "area",
      zoomType: 'x',
      animation: Highcharts.svg, // don't animate in old IE
      marginRight: 10,
      events: {
        load: function () {
          series = this.series[0];
        }
      }
    },
    title: {
      text: 'Memory usage'
    },
    xAxis: {
      type: 'datetime',
      tickPixelInterval: 150,
      minRange: 10 //
    },
    yAxis: {
      title: {
        text: 'Usage in MB'
      },
      floor: 0,
      min: 0
    },
    legend: {
      enabled: true
    },
    tooltip: {
      shared: true,
      crosshairs: true
    },
    plotOptions: {
      area: {
        fillOpacity: 0.5
      }
    },
    credits: {
      enabled: false
    },

    series: [
      {
        name: 'Memory usage in MB',
        data: data,
        color: 'rgba(126,86,134,.9)'
      }
    ]
  });
  return series;
}

function cpuGraph (id, data) {
  var series;
  $(id).highcharts({
    chart: {
      type: "area",
      zoomType: 'x',
      animation: Highcharts.svg, // don't animate in old IE
      marginRight: 10,
      events: {
        load: function () {
          series = this.series[0];
        }
      }
    },
    title: {
      text: 'CPU usage'
    },
    xAxis: {
      type: 'datetime',
      tickPixelInterval: 150,
      minRange: 10
    },
    yAxis: {
      title: {
        text: 'Usage in %'
      },
      floor: 0,
      max: 100,
      min: 0
    },
    legend: {
      enabled: true
    },
    tooltip: {
      shared: true,
      crosshairs: true
    },
    plotOptions: {
      area: {
        fillOpacity: 0.5
      }
    },
    credits: {
      enabled: false
    },

    series: [
      {
        name: 'CPU usage in %',
        data: data,
        color: 'rgba(255,153,0,.9)'
      }
    ]
  });
  return series;
}

/*********** GRAPHES BLOCKCHAIN **********/

function timeGraphs (id, timeAccelerations, medianTimeIncrements, speeds, minSpeeds, maxSpeeds) {
  var timesInc = [];
  medianTimeIncrements.forEach(function (inc) {
    timesInc.push(inc == 0 ? 1 : inc);
  });
  $(id).highcharts({
    chart: {
      // type: "area",
      zoomType: 'x'
    },
    title: {
      text: 'Blockchain time variations'
    },
    xAxis: {
      minRange: 10 // 10 blocks
    },
    yAxis: {
      type: 'logarithmic',
      minorTickInterval: 1,
      title: {
        text: 'Number of seconds (logarithmic scale)'
      }
    },
    legend: {
      enabled: true
    },
    tooltip: {
      shared: true,
      crosshairs: true
    },
    plotOptions: {
      area: {
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1},
          stops: [
            [0, Highcharts.getOptions().colors[0]],
            [1, Highcharts.Color(Highcharts.getOptions().colors[0]).setOpacity(0).get('rgba')]
          ]
        },
        marker: {
          radius: 2
        },
        lineWidth: 1,
        states: {
          hover: {
            lineWidth: 1
          }
        },
        threshold: null
      }
    },
    credits: {
      enabled: false
    },

    series: [
      {
        name: 'Time acceleration',
        data: timeAccelerations
      },{
        name: "Median Time variation",
        data: timesInc
      },{
        type: 'line',
        name: "Too high duration",
        data: maxSpeeds
      },{
        type: 'line',
        name: "Actual duration",
        data: speeds
      },{
        name: "Too low duration",
        data: minSpeeds
      }
    ]
  });
}