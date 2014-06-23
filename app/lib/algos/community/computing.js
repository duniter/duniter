var Computing = { Membership: {}, Voting: {} };

/**
* Computes changes for a key, given its current state + changes.
* @parameter ms Array of 4 Integers: [currentNone, currentIn, currentOut, currentInTooOld].
*   Each integer is either 1 or 0:
*   * currentNone: 1 if current membership of a key doesn't exist, 0 otherwise
*   * currentIn: 1 if current membership of a key is a valid IN, 0 otherwise
*   * currentOut: 1 if current membership of a key is OUT, 0 otherwise
*   * currentInTooOld: 1 if current membership of a key is a too old IN, 0 otherwise
*   __Sum of those 4 integers MUST always be 1.__
*
* @parameter p Array of 4 Integers: [newNone, newIn, newOut, newInCancelled, newOutCancelled].
*   Each integer is either 1 or 0:
*   * newNone: 1 if new membership of a key doesn't exist, 0 otherwise
*   * newIn: 1 if new membership of a key is IN, 0 otherwise
*   * newOut: 1 if new membership of a key is OUT, 0 otherwise
*   * newInCancelled: 1 if new membership of a key is IN, which has been cancelled, 0 otherwise
*   * newOutCancelled: 1 if new membership of a key is OUT, which has been cancelled, 0 otherwise
*/
Computing.Membership.Delta = function (ms, p, done) {

  if (ms.reduce(function(a,b){ return a + b; }) !== 1) {
    done('Wrong membership state array: should be either in, out, in too old or no membership at all.');
  }

  /**
  * Computes changes for a key given changes with and initial state
  * @param m 1 if initial state is no membership, 0 otherwise
  * @param p array of changes
  */
  function IsMember (p) {
    return - 2*p[0] - p[2];
  }

  /**
  * Computes changes for a key given changes with and initial state
  * @param m 1 if initial state is no membership, 0 otherwise
  * @param p array of changes
  */
  function IsNotMember (p) {
    return - 2*p[0] + p[1];
  }

  done(null, ms[0]*IsMember(p) + ms[1]*IsNotMember(p));
}

/**
* Computes changes for a voter, using given voting & membership events.
* @parameter vt Array of 2 Integers: [wasNotVoter, wasVoter].
*   Each integer is either 1 or 0:
*   * wasNotVoter: 1 if key was not voter, 0 otherwise
*   * wasVoter: 1 if key was voter, 0 otherwise
*   __Sum of those 2 integers MUST always be 1.__

* @parameter p Array of 4 Integers: [hasNotVoted, hasVoted, hasNewVoting, isLeavingMember].
*   Each integer is either 1 or 0:
*   * hasNotVoted: 1 if voter has voted current amendment, 0 otherwise
*   * hasVoted: 1 if voter has voted current amendment, 0 otherwise
*   * hasNewVoting: 1 if member submitted new voting key, 0 otherwise
*   * isLeavingMember: 1 if member is leaving, 0 otherwise
*/
Computing.Voting = function (vt, p, done) {

  done(null, vt[0]*IsNotVoter(p) + vt[1]*IsVoter(p) + vt[2]*IsVoterTooOld(p));
}

function IsNotVoter (p) {
  return p[1] - 2*p[2];
}

function IsVoter (p) {
  return - 2*p[2];
}

function IsVoterTooOld (p) {
  return - p[0] + p[1] - 2*p[2];
}

module.exports = Computing;
