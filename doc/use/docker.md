# Docker image for Duniter

## Building

Build this image:

    docker build . -t duniter/duniter

## Usage

Start the node:

    docker run -d -p127.0.0.1:9220:9220 -p10901:10901 -p20901:20901 --name duniter duniter/duniter

You can execute `duniter` commands on the started container, for example:

    docker exec -it duniter duniter wizard key
    docker exec -it duniter duniter sync g1.duniter.fr 443

You also can open a new terminal on the started container with:

    docker exec -it duniter /bin/sh

The web UI can be accessed from the host machine by browsing http://localhost:9220.

Stop the node:

    docker stop duniter

Restart the stopped node:

    docker start duniter

## Features

### Volumes

The container creates 2 docker volumes. The first one is mounted under `/etc/duniter` and contains the Duniter configuration. The other one is mounted under the Duniter home directory, i.e. `/var/lib/duniter`. This is the place the Duniter database will be stored.

See more about managing volumes with docker in the [docker documentation](https://docs.docker.com/storage/volumes/).

If you mount one or more of these directories on your host, be careful that the files must be accessable by the in-image `duniter:duniter` user (uid:gid is 1111:1111).

### Keyfile

If the `/etc/duniter/keys.yml` is found on the image, it will automatically be used as keyfile for the server. If you have such a file in your current directory, you can start the node with:

    docker run -d -p127.0.0.1:9220:9220 -p10901:10901 -p20901:20901 --mount src="${PWD}",dst=/etc/duniter --name duniter duniter/duniter

Note that your file must be readable by the in-image `duniter:duniter` user (uid:gid is 1111:1111).

### Image parameters

If you give parameters to the image when creating container, they will be given to the Duniter node. In this case, it will not start the Duniter daemon. Example:

    docker run -it --name duniter duniter/duniter logs

When no parameters are given, `duniter` is called with the command `direct_webstart`.

Note that you should not call duniter with daemon command (`webstart` or `start`) if you run docker with `-d` parameter, because the docker image will then immediately stop.

## Test develop version

To test develop version on G1-test network:

    docker run -d -p127.0.0.1:9330:9220 -p10900:10900 -p20900:20900 -v $HOME/duniter-docker-home:/var/lib/duniter --name registry.duniter.org nodes/typescript/duniter:dev sync g1-test.duniter.org
