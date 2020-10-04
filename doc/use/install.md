Title: Install Duniter Server
Order: 9
Date: 2017-09-22
Slug: configurer
Authors: elois

# Install Duniter Server

## Distribution based on debian (including Ubuntu and some others)

A debian package is provided for the `x86_64` and `armv7l` architectures. If you don't know what it is, you probably need package for `x86_64` architecture.

If your architecture is different, you can try to [compile Duniter yourself](manual_compilation.md) or [install Duniter via Docker](docker.md).

Go to the [release page](https://git.duniter.org/nodes/typescript/duniter/-/releases) to get a link to the last stable release.

Download the debian package and install it:

```bash
sudo dpkg -i duniter-*-linux-x64.deb
```

Then [configure your Duniter node](configure.md).

## Gentoo 64 bits

In order to install Duniter on Gentoo, there is a package in the overlay [sveyret-overlay](https://github.com/sveyret/sveyret-overlay). A README file can be found in this overlay to help you and add it to the Portage tree.

You will then be able to install the package net-p2p/duniter:

`emerge -av net-p2p/duniter`

The following USE flags allow you to decide what will be built:
Flag Description
desktop Build and install the desktop version instead of the server one
gui Add the GUI (mandatory for desktop version, add the web interface for server version)

The server version node for Gentoo can also be automatically started.

## YunoHost

A [YunoHost package](https://github.com/duniter/duniter_ynh) is available.

## Other distributions

You need to [compile Duniter yourself](manual_compilation.md) or [install Duniter via Docker](docker.md).

## Mac

In theory, duniter-server should compile under Mac, but this has never been tested. You can try to [compile it from source](manual_compilation.md) and let us know the result on the [Duniter forum](https://forum.duniter.org).

## Windows

Duniter-server does not support Windows.
