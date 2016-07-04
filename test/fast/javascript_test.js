"use strict";
var should = require('should');
var co = require('co');

describe('JavaScript', () => {

    describe('for loops', () => {

        const array1 = [1, 2, 3];
        array1.abc = 2;

        it('for (.. in ..)', () => {
            array1.abc = 2;
            let sum = 0;
            for (const i in array1) {
                sum += array1[i];
            }
            sum.should.equal(8); // <-- Yes, it does not equal 6! Because `for .. in` is not `hasOwnProperty` checked.
        });

        it('for (.. of ..)', () => {
            let sum = 0;
            for (const value of array1) {
                sum += value;
            }
            sum.should.equal(6);
        });

        it('with promises', () => co(function*() {
            let sum = 0;
            for (const value of array1) {
                sum += yield Promise.resolve(value);
            }
            sum.should.equal(6);
        }));
    });
});
