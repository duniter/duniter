## v1.8.0 (XX XXXX 2019)

### Highlights
- Migration to Nodejs v10

### Code
- #1373: Support for Nodejs v10
- #1372: `scryptb` removal
- [enh] Upgrade TypeScript to 3.4.3
- [enh] Abstracting conf DAL to ConfDAO
- [enh] Remove ArchiveDAO, which is a LokiJS artifact
- [enh] Add to an interface ServerDAO methods that could be used by external modules
- [enh] StatsDAL => replaced by LevelDB indexes

### BMA
- [enh] Document `network/ws2p/heads`
- [fix] In case of wrong network configuration, Duniter could crash on startup
- [fix] `/branches` should not throw if current block does not exist

### CI
- Add g1 and gt control hash has changed to add `replayable_on`

Thanks @c-geek, @Moul, @vtexier

## v1.7.19: (28th May 2019)
- #1379: prevent expired membership documents to reach the mempool
- #1380: prevent expired certifications to reach the mempool

@c-geek

## v1.7.18: (2nd May 2019)
#### Code
- [La Ğ1-test est bloquée au bloc n°362834.](https://forum.duniter.org/t/g1-test-dans-les-choux/4192/318)

Thanks @Moul, @c-geek, @jytou

## v1.7.17 (28th April 2019)
#### CI/CD
- Fix artifactory process: move to a minimalist jinja2 Docker image
- Trigger integration stages pipeline only when code changes
- Set releases:x64 artifacts to expire after six months

#### Code
- [Duniter v1.7.17 : règle de distance non respectée](https://forum.duniter.org/t/duniter-v1-7-17-regle-de-distance-non-respectee/6057)
- Add `sync-mempool-fwd` command
- Add `dump wot` command
- #1358: Remove Loki related code
- #1356: Remove non-used code getting membership status
- !1269: Add more feedback on BMA interface configuration

#### Other
- Upgrade outdated dependencies: morgan, seedrandom, socks-proxy, and tail
- Update README.md
- Add initial CHANGELOG.md for releases from v1.7.15

Thanks @Moul, @c-geek, @Tuxicoman

## v1.7.16 (6th April 2019)
**Hotfix release for Ğ1**

- [Duniter v1.7.16 : Bug à l’ajout d’une certification d’un non membre dans le bloc à calculer](https://forum.duniter.org/t/duniter-v1-7-16-bug-a-l-ajout-d-une-certification-d-un-non-membre-dans-le-bloc-a-calculer/5952/96)
- Add variable type

Thanks @Moul, @c-geek, @jytou

## v1.7.15 (4th April 2019)
**Hotfix /tx/history/<pubkey> broken since 1.7 release**

- #1350, !1276: Time of transactions not being saved on SQLite table
- Integration tests for transaction history and transaction history with times filters
- dump-ww: use file copy + semaphore to trigger the copy 

Thanks @bpresles, @c-geek

## v1.7.14 (29th March 2019)
- … To be completed
