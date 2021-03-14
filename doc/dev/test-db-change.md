# How to test a change in the schema of a DB

1. Test your code first via automated tests
2. Compile duniter
3. Compile dex
4. Create a duniter profile for your test
5. Synchronize a small blockchain for your test
6. Explore the DB with dex to verify that it contains the expected data

## 1. Test your code first via automated tests

## 2. Compile duniter and dex

There are several ways to compile duniter depending on what you have modified.

If all your diffs are only in the `rust-libs` folder, then the fastest way is to run the neon script directly:

`./neon/build.sh`

WARNING: this only works if you have already compiled duniter completely since your last update on the `dev` branch.

If you have diffs in other folders than `rust-libs`, or if in doubt, recompile everything:

`cargo xtask build`

## 3. Compile dex

`cargo bdex`

WARNING: this take a long time!

## 4. Create a duniter profile for your test

There is no profile creation command. The profile is automatically created the first time it is used.

This step is only necessary if you need your test profile to be a different configuration than the default.

For example, if you need GVA, use the following command:

```bash
$ cargo rr -p test1 wizard gva
    Finished release [optimized] target(s) in 0.06s
     Running `target/release/duniter -p test1 wizard gva`
2021-03-14T22:34:47+01:00 - warn: No configuration loaded
Enable GVA API? [Y/n]
Listen to ip v4 ? [127.0.0.1]
Listen to ip v6? [Y/n]n
Listen to port ? [30901]
Path ? [gva]
Subscriptions path ? [gva-sub]
Define a remote host? [y/N]
Define a remote port? [y/N]
Define a remote path? [y/N]
Define a remote subscriptions path? [y/N]
Update whitelist? [y/N]
Configuration successfully updated.
```

## 5. Synchronize a small blockchain for your test

You will need to have the json archives of a blockchain.
The easiest way is to take the json archives from the beginning of Ğ1, you can find them on the gitlab in the `blockchain-archives` repository:

[link to the json archive of the first 132446 blocks of the Ğ1](https://git.duniter.org/c-geek/blockchain-archives/-/blob/master/snapshots/g1/132446.tar.gz)

Then, start a synchronization with the following command:

`cargo rr -p test1 sync /path/to/json/archive`

If the synchronization is too long, there are two solutions:

1. Recompile duniter in release mode (`NEON_BUILD_RELEASE="true" ./neon/build.sh`)
2. Reduce the size of the json archive by deleting chunks from the end

## 6. Explore the DB with dex to verify that it contains the expected data

See `./target/release/dex --help`
