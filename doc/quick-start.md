# Quick-start-guide : start a duniter node with web-ui from source

## Prerequisite :
- git ([Windows, Mac, Linux](https://git-scm.com/downloads))
- nodejs ([Windows, Mac](https://nodejs.org/), [Linux](https://nodejs.org/en/download/package-manager/))
- python 2.7 ([Windows, Mac](https://www.python.org/downloads/), Linux -> you allready have it)
- gcc ([Windows, Mac, Linux](https://github.com/nodejs/node-gyp#installation))
- [GitHub](https://github.com/) account (optional, needed to contribute)

Alternative : for Windows user who love screenshot : [from Windows Installation to ready to use nodejs](https://www.serverpals.com/blog/building-using-node-gyp-with-visual-studio-express-2015-on-windows-10-pro-x64#user-content-fresh-windows-installation)

[//]: # ([prepare your computer to use nodejs (Windows, Mac, Linux)]() http://osxdaily.com/2014/02/12/install-command-line-tools-mac-os-x/ https://github.com/creationix/nvm#install-script )

## Install

```bash
git clone https://github.com/duniter/duniter.git
cd duniter
npm run full-install
npm run webstart
```
Connect to your duniter-node admin web-panel on : [http://localhost:9220/](http://localhost:9220/)

## Contribute

- On github, fork https://github.com/duniter/duniter on your account repository.
- Change, improve, do what will be usefull.
- Run `npm test` and if it's ok
- Run `git remote add myFork https://github.com/<<yourAccount>>/duniter.git` or similar writable git repository.
- Run `git add .` or other command to prepare your commit
- Run `git status` to check what will be in your commit
- Run `git commit -m "explain what you have do/improve"`
- Run `git push myFork`
- On github create a pull-request for your contrib.

