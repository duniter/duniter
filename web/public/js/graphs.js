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