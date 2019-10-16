# Validator's guide

When a new version is to be released, particularly the major and minor ones, the software has to be tested to be sure that there isn't any major flaw shipped in.

Even if Duniter already have a bunch of automated tests, integration tests a still required to control the software's behavior in real-world conditions.

This document enumerates the points of control that has to be manually tested before marking a release as "OK".

> This document will be regularly updated to strengthen and precise the controls to be done and expected results.

## Commands

### `duniter reset data`

Duniter should be able to reset its data.

### `duniter sync g1.duniter.org 443`

Duniter should be able to synchronize on this mirror peer.

### `duniter direct_start`

Duniter should be able to start with interactive execution. Should be stoppable with Ctrl+C.

### `duniter start`

Duniter should be able to start in daemonized way.

### `duniter status`

Duniter should be UP and running after `duniter start`.

### `duniter stop`

Duniter should be able stoppable after `duniter start`.

### `duniter webstart`

Duniter should be able to start in a daemonized way with its UI available at `http://localhost:9220`.

## Behavior

Duniter must respect a set of behaviors once started.

### Memory consumption

Duniter must have a footprint of ~150MB in memory. If this amount grows, there is a memory leak.

### New blocks detection

Duniter should detect eventual new blocks available on the network on its startup, pull and add them to its HEAD branch.

#### Main blocks

Duniter should be able to receive and add new valid blocks for the HEAD of its blockchain.

#### Fork blocks

Duniter should be able to receive *fork blocks*, i.e. blocks that does not push on the top of its blockchain and whose number is < HEAD.number - forkWindowSize.

> `forkWindowSize` is the value given at URL `/` of each node, for example https://g1.duniter.org/

### Network detection

Duniter should be detected by the existing network. As soon as the node is UP, it should be known and UP by the node it was synced with (in the tests, g1.duniter.org:443).

### Fork resolution

Duniter should be able to resolve forks, i.e. switch on a branch that does not contain HEAD but which is taller than HEAD branch by at least:

* 6 blocks
* 30 minutes of `medianTime` field

> A technique to test this:
>
> ```
> duniter reset data
> duniter sync g1.duniter.org 443
> duniter gen-next --local-submit
> ```
>
> Then wait for the local block to be computed, as well as the network block. This way, the local node should have a different HEAD than the network. Starting the node shoul show a fork on the network with only our node.
>
> After ~30 minutes, the fork should be resolved.
>

### Bloc computation

The node should sucessfully compute one block.
