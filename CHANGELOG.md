## v1.7.17: To be released (## #### 2019)
#### CI/CD
- Fix artifactory process: move to a minimalist jinja2 Docker image
- Trigger integration stages pipeline only when code changes
- Set releases:x64 artifacts to expire after six months

#### Code
- Add `sync-mempool-fwd` command
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
