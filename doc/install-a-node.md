# Install a Duniter node

## Goal of this document

This document is a little guide to install & deploy your own Duniter instance to either:

* Participate writing the blockchain (you need to be a member)
* Have a mirroring node

## Summary

* [Desktop](#desktop)
  * [GNU/Linux](#gnu-linux)
    * [Ubuntu 64 bits](#ubuntu-64-bits)
    * [Debian 64 bits](#debian-64-bits)
    * [Other distribution](#other-distribution)
  * [Windows](#windows)
  * [MacOS](#macos)
* [Server](#server)
  * [GNU/Linux](#gnu-linux-1)
    * [Ubuntu/Debian package (64 bits)](#ubuntudebian-package-64-bits)
    * [YunoHost](#yunohost)
    * [Automated install script](#automated-install-script)
    - [Other distributions (64 bits)](#other-distributions-64-bits)
    * [Docker](#docker)
    * [NPM](#npm)
  * [Windows](#windows-1)

----

# Desktop

A desktop machine will make it easier for you to manage your Duniter instance thanks to a graphical interface.

Your instance will be up as long as you keep your computer and Duniter software on. If you close your software or shut down your computer, Duniter will be able to resync with the network when you restart it.

> Once you are done with the installation, you can follow [the desktop user's guide](https://forum.duniter.org/t/duniter-desktop-guide/902) to understand how to use Duniter.

## GNU/Linux
### Ubuntu 64 bits

1. Go to the [releases page](https://github.com/duniter/duniter/releases) and choose the latest build. You have to download the file with `.deb` extension.
<img src="https://forum.duniter.org/uploads/default/original/1X/ee8da9eb6c1fed7effee11fb4468c2ad11f9b04a.png" width="500" height="106">

2. Process the installation by a double-click on the downloaded `.deb` file (or with `dpkg` software if you prefer to use it).

3. Use Ubuntu Dash to look for "Duniter" and click on it to launch the software:
  <img src="https://forum.duniter.org/uploads/default/original/1X/20c6ce83e14ba37a49fa9fa01264d49b6b861b2b.png" width="536" height="246">

### Debian 64 bits

1. Go to the [releases page](https://github.com/duniter/duniter/releases) and choose the latest build. You have to download the file with `.deb` extension.

2. Process the installation by opening the file with `GDebi` (or with `dpkg` software if you prefer to use it).
<img src="https://forum.duniter.org/uploads/default/original/1X/4a7a8147635cd49c32c1ec8481a659f1e578c76d.png" width="460" height="202">

3. Use Gnome Shell to look for "Duniter" and click on it to launch the software.
<img src="https://forum.duniter.org/uploads/default/original/1X/6a92043447c583ef3c47e84742b67ce2fd799a49.png" width="690" height="428">

> At any moment you could also use `duniter-desktop` command to launch Duniter. It is an equivalent.

### Other distribution

#### Installation

Duniter can be easily installed on most Linux machines (either 32bits or 64bits) using the following command:

> **Do not launch this command as root.** [It won't work, we know it](https://github.com/duniter/duniter/issues/412).

```bash
curl -kL https://raw.githubusercontent.com/duniter/duniter/master/install.sh | bash
```

or:

```bash
wget -qO- https://raw.githubusercontent.com/duniter/duniter/master/install.sh | bash
```

#### Launch

The software will be installed on path `/home/[user]/.duniter/`. To launch it, go this folder and launch:

```bash
./nw/nw
```

The graphical interface should now show up.

## Windows

1. Go to the [releases page](https://github.com/duniter/duniter/releases) and choose the latest build. You have to download the file with `.exe` extension.

2. Process the installation by a double-click on the downloaded `.exe` file.
<img src="https://forum.duniter.org/uploads/default/original/1X/fd5beca823f8a2cadf86748c12a7c287009ab819.png" width="591" height="39">

3. Follow the installation procedure. You basically just need to accept the licence and click "Next" on each step.
<img src="https://forum.duniter.org/uploads/default/original/1X/be778e08bed1db1c40fbf837ad7a47492a88c030.png" width="503" height="387">

4. Duniter is now installed, by default it will be launched at the end of the installation. You can launch it in the Windows menus "Start > Programs > Duniter > Duniter".

<img src="https://forum.duniter.org/uploads/default/original/1X/79b498209a8f95ca9a69cb1dacff843a50acce5b.png" width="271" height="58">

> It may occur that the downloaded file misses the `.exe` extension. This is a Windows protection. You have to circumvent it by renaming the file and add `.exe` to the end of the name to be able to execute it.

## MacOS

> Coming soon.
> Meanwhile, you can try the [Linux/Other distributions] section which will probably work. Please contact us on [our forum](https://forum.duniter.org) if you have any difficulty or succeed with this procedure, we lack a Mac for testing.

# Server

For the most advanced users, a server install allows you to have a node up 100% of the time since a server is made to run forever.

You will control your instance using *command line tools*, but if you want you could also access the graphical interface using a web browser. Note how this is an even more advanced usage and requires security skills for not opening an admin access to your node.

> Once you are done with the installation, you can follow [the command line user's guide](https://forum.duniter.org/t/duniter-command-line-guide/903) to understand how to use Duniter.

## GNU/Linux
### Ubuntu/Debian package (64 bits)

1. Go to the [releases page](https://github.com/duniter/duniter/releases) and choose the latest build. You have to download the file with `.deb` extension.

2. Process the installation by launching `dpkg -i` on the downloaded file. This requires root credentials.

```bash
dpkg -i [downloaded_file_name].deb
```
### YunoHost

A [YunoHost package](https://github.com/duniter/duniter_ynh) is available.


### Other distributions (64 bits)

1. Go to the [releases page](https://github.com/duniter/duniter/releases) and choose the latest build. Download the file with `.tar.gz` extension.

2. Extract the tarball: `tar zxvf duniter-*.tar.gz`.

3. Run it with `./nw/nw`.


### Automated install script

Duniter can be easily installed on most Linux machines (either 32bits or 64bits) using the following command:

> **Do not launch this command as root.** [It won't work, we know it](https://github.com/duniter/duniter/issues/412).

```bash
curl -kL https://raw.githubusercontent.com/duniter/duniter/master/install.sh | bash
```

or:

```bash
wget -qO- https://raw.githubusercontent.com/duniter/duniter/master/install.sh | bash
```

>2 lines will be added to your shell init script to make `duniter` command available for your user.

### Docker

A [Docker installation guide](https://github.com/duniter/duniter/blob/master/docker/README.md) is available.

### NPM

You can use Node Package Manager to install Duniter. This an equivalent method to "build from source". To process, use the following commands (**requires Node.js >= 5.9.1**):

> **Do not launch this command as root.** [It won't work, we know it](https://github.com/duniter/duniter/issues/412).

```bash
git clone https://github.com/duniter/duniter
cd duniter
npm install
```
You can check installed version by using:
```bash
./duniter.sh --version
0.20.x
```

You can launch Duniter using:

```bash
export DEV_MODE=true
./duniter.sh start
```

## Windows

Their is no difference with the [Windows Desktop](#windows) installation. A server usage with Windows is just a never shut down desktop for Duniter.
