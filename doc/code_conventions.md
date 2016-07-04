# Code conventions

This document is about code pratices to be followed for any developer on Duniter.

We enumerate here the conventions we try to follow *as much as possible* to have a robust and understandable code.

## Rule 1: `let`, `const` and `var`

`const` is the default variable declaration. Because most of the time we do not need to reassign a variable, so using `const` warns you if, by error, you try to reassign it. If reassignment was not an error and you do need to change the variable value, then modify `const` by `let` in this case.

> We know, `const` if 5 characters and `let` is only 3. But these 2 more characters may be what makes the difference between robust and weak code.

`var` is to be avoided, anytime. Prefer `const` or even `let`, everywhere.

## Rule 2: `for` loops

### `for (let i = .. ; .. ; ..)`

As a consequence of rule 1, please avoid `var` for the `for` loop iterator variable. `const` cannot be used because the `i` iterator value is changed at each turn, so `let` is the only acceptable option for our code.

### `for (.. of ..)`

Prefer the `for(const value in array)` syntax instead of `for (.. in ..)` *if you don't need the array indices*. Indeed, not only do we save a line of code for value extraction (`const value = array[i]`), but `for(.. in ..)` iterates over *any enumerable property*, not only the array indices.

So looking at these 2 examples, the first one `for(.. in ..)` will fail:

```js
const array1 = [1, 2, 3];
array1.abc = 2;

it('for (.. in ..)', () => {
    let sum = 0;
    for (const i in array1) {
        sum += array1[i];
    }
    sum.should.equal(6); // <-- This test fails! sum equals 8, because we have an extra enumerable property `abc` which equals `2`.
});

it('for (.. of ..)', () => {
    let sum = 0;
    for (const value of array1) {
        sum += value;
    }
    sum.should.equal(6); // <-- This test passes
});
```

So, prefer using `for (.. of ..)` for array iteration, which has a built-in iterator taking care of iterating through indices only, or built-in functions like `forEach`, `map`, ... whenever possible.

### Loops with promises in it

When you have code in a loop dealing with promises, you *cannot* use `forEach`, `map`, ... built-in functions which takes a callback as argument. Only `for (let i = .. ; .. ; ..)` and `for (const value of ..)` syntax can be used to have executable code. The compiler will throw an error on parsing time (right before the program starts).

> `for (.. in ..)` loops also works, but as we said earlier we do not use this syntax here.

## Rule 3: always put braces

Although JS do not care if you omit braces for a one line statement (for example in a `if`), **please add the embraces and adapted indentation anyway**. We prefer to see the explicit block of code concerned by a `if`. Example:

```js
if (a = 2) {
    console.log('This is correct block');
}
```

```js
if (a = 2) console.log('This is INCORRECT block, it misses the braces');
```
