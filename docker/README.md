# Duniter in a Docker container

Download `Dockerfile` and `go` files in a repository.

#### Build a container

```sh
docker build -t="duniter" .
```

#### Execute the container

Without your indentity

```sh
docker run -p 10901:10901 \
  -e "DUNITER_URL=cgeek.fr" -e "DUNITER_PORT=9330" \
  -dt duniter
````

With your indentity

```sh
docker run -p 10901:10901 \
  -e "DUNITER_URL=cgeek.fr" -e "DUNITER_PORT=9330" \
  -e "DUNITER_SALT=<your_key_salt>" -e "DUNITER_PASSWD=<your_passwd>" \
  -dt duniter
````
