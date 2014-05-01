
module.exports = coinsForValue;

function coinsForValue (value, l, p) {
  var coins = [];
  var rest = value;
  do {
    var power = findClosestLower2Power(rest);
    rest -= Math.pow(2, power);
    coins = coins.concat(L(power, l, p || 0));
  } while (rest > 0);
  var base = coinBase(coins);
  var list = coinList(coins, base);
  return {
    coins: coins,
    coinBase: base,
    coinList: list
  };
}

function findClosestLower2Power (number) {
  var power = 0;
  while (Math.pow(2, power) <= number) {
    power++;
  }
  return --power;
}

function P (n, p) {
  var values = [Math.min(n, p)];
  for (var i = Math.min(n, p); i < n; i++) {
    values.push(i);
  }
  return values;
}

function L (n, l, p) {
  var values = [];
  for (var i = n-1; i >= l; i--) {
    values.push(P(i, p));
  }
  values.push(P(Math.min(n, l), p));
  return values;
}

function coinBase (generatedCoins) {
  var base = null;
  generatedCoins.forEach(function(Pn){
    Pn.forEach(function(coinPower){
      if (base == null)
        base = coinPower;
      else
        base = Math.min(base, coinPower);
    });
  });
  return base;
}

function coinList (generatedCoins, coinBase) {
  var coinsByPower = {};
  var min = coinBase, max = 0;
  generatedCoins.forEach(function(Pn){
    Pn.forEach(function(coinPower){
      coinsByPower[coinPower] = coinsByPower[coinPower] || 0;
      coinsByPower[coinPower]++;
      max = Math.max(max, coinPower);
    });
  });
  var coinList = [];
  for (var i = min; i <= max; i++) {
    coinList.push(coinsByPower[i] || 0);
  }
  return coinList;
}
