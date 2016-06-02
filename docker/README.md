# Duniter in a Docker container

Download `Dockerfile` and `go` files in a repository.

#### Build a container

```sh
docker build -t="duniter" .
```

#### Execute the container

```sh
docker run -p 8999:8999 -dt duniter
````
