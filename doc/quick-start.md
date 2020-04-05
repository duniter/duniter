# Quick-start-guide : start a duniter node with web-ui from source

## Prerequisite

- [git](https://git-scm.com/downloads)
- [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
- [yarn](https://classic.yarnpkg.com/en/docs/install/)
- [python 2.7](https://www.python.org/downloads/) (Linux? -> you allready have it)
- [gcc](https://github.com/nodejs/node-gyp#installation)
- [rust](https://www.rust-lang.org/learn/get-started)
- [Gitlab](https://git.duniter.org/) account (optional, needed to contribute)

## Install

```bash
git clone https://git.duniter.org/nodes/typescript/duniter.git
cd duniter
yarn
yarn add duniter-ui
bin/duniter webstart
```

Connect to your duniter-node admin web-panel on : [http://localhost:9220/](http://localhost:9220/)

## Contribute

- On gitlab, fork https://git.duniter.org/nodes/typescript/duniter on your account repository.
- Change, improve, do what will be usefull.
- Run `yarn test` and if it's ok
- Run `git remote add myFork https://git.duniter.org/<<yourAccount>>/duniter.git` or similar writable git repository.
- Run `git add .` or other command to prepare your commit
- Run `git status` to check what will be in your commit
- Run `git commit -m "explain what you have do/improve"`
- Run `git push myFork`
- On gitlab create a merge-request for your contrib.
