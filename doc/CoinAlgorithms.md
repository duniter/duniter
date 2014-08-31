# Coin algorithms

In uCoin's [amendments](./HDC.md#amendment), a field name  `CoinAlgo` is dedicated to describe the rules for both generation and interpretation of `CoinList` and `CoinBase` amendment's fields.

Here is a list of known algorithms (only `1` for now).

## Base2Draft

### Usage

In an [Amendment](./HDC.md#amendment) : `CoinAlgo: Base2Draft`.

### Properties

This algorithm uses « base 2 » numerical representation for coins' quantitative value.

### Coin value

Each number in `CoinList` field represents a 2<sup>`n`</sup> value, starting from left first number = 2<sup>`CoinBase`</sup>, and for each number, increase the `CoinBase` value.

Each number in `CoinList` tells how much coins of each value are issued.

#### Example

```bash
CoinAlgo: Base2Draft
CoinBase: 3
CoinList: 2 1 0 5
```

In such case, generated coins are:

* `2` coins of value 2<sup>3</sup> = 2<sup>`CoinBase`</sup>
* `1` coins of value 2<sup>4</sup> = 2<sup>`CoinBase + 1`</sup>
* `0` coins of value 2<sup>5</sup> = 2<sup>`CoinBase + 2`</sup>
* `5` coins of value 2<sup>6</sup> = 2<sup>`CoinBase + 3`</sup>

We can deduce here that `UniversalDividend` equals `352`.

### Coin determination

#### Prerequisties

* `UniversalDividend` amount, abbreviated `UD`

#### Algorithm

##### Parameters

* `p` : the threshlod under which the algorithm should not create coins while it can

##### Functions

`L(n, p) = [ P(n-1,p) P(n-1,p) ... P(0,p) ]`

`P(n, p) = [ min(n,p) min(n,p)+0  min(n,p)+1 ... min(n,p)+(n-1) ]`

##### Description
  
    // Initialization
    coins = []
    groups = {}
    rest = UD
    
    // Compute coins 2^ values
    while (rest >= 0)
      pow2 = highestPow2Value(rest)
      rest = rest - pow(2, pow2)
      coins = concat(coins, L(pow2, p))
      
    // Count the number of occurences for each coin
    foreach pow2 in coins
      if (exists(groups(pow2)))
        groups(pow2) = groups(pow2) + 1
      else
        groups(pow2) = 1
        
    // Sort the coins counts by their coin value
    sortByKey(groups)
  
### Example 1

Let's make coins with `UD = 32`, and `p = 0` (`2^p = 1`):

    32 = 16 + 8 + 4 + 2 + 1 + 1
         =
         8    =
        +4    4   =
        +2   +2   2   =
        +1   +1  +1   1   =   =
        +1   +1  +1  +1   1   1
Giving:

    CoinAlgo: Base2Draft
    CoinBase: 0
    CoinList: 10 3 2 1
  
### Example 2

Let's make coins with `UD = 13`, and `p = 0` (`2^p = 1`):

#### Decimal format

    13 = 8 + 4 + 1
         =
         4   =
        +2   2
        +1  +1   =
        +1  +1   1
    
#### Binary format

    13 = 8 + 4 + 1
         =
         2   =
        +1   1
        +0  +0   =
        +0  +0   0

Giving:

    CoinAlgo: Base2Draft
    CoinBase: 0
    CoinList: 5 2 1
  
### Example 3

Let's make coins with `UD = 13`, and `p = 1` (`2^p = 2`):

    13 = 8 + 4 + 1
         =
         4   =
        +2   2
        +2  +2   =
                 1

Giving:

    CoinAlgo: Base2Draft
    CoinBase: 0
    CoinList: 1 4 1
  
### Example 4

Let's make coins with `UD = 13`, and `p = 2` (`2^p = 4`):

    13 = 8 + 4 + 1
         =
         4   =
        +4   4
                 =
                 1

Giving:

    CoinAlgo: Base2Draft
    CoinBase: 0
    CoinList: 1 4 1