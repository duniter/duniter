# Coin algorithms

In uCoin's [amendments](./HDC.md#amendment), a field is dedicated to describe the rules of generation and interpretation of amendment's `CoinList` and `CoinBase` fields. This field is `CoinAlgo`, whose value is one the following algorithms.

## Base2Draft

### Usage

Using this algorithm is precised in an amendment by using `CoinAlgo: Base2Draft`.

### Properties

This algorithm uses base 2 representation for coins.

### Coin value

Each number in `CoinList` field represents a Pow(2) value, starting from left first number = 2^`CoinBase`, and for each number, increase the `CoinBase` value.

Each number in `CoinList` tells how much coins of each value are issued.

#### Example

```bash
CoinAlgo: Base2Draft
CoinBase: 3
CoinList: 2 1 0 5
```

In such case, generated coins are:
* 2 coins of value 2^3
* 1 coins of value 2^4
* 0 coins of value 2^5
* 5 coins of value 2^6

### Coin determination

Algorithm:

1. Given a dividend amount, deduce `CoinBase` field by finding the rank of this dividend, and taking Max(rank - 5, 0).
2. Split dividend into 2^ coins using following subalgorithm, with threshold value `CoinBase`
  a. ...
  b. ...

> Rank: highest 10^ unit of a number. For example, 2.500.000's rank is 6 because the highest unit is 2 and is 2*10^6.
