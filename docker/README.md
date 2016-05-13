# Duniter dans un container Docker

Télécharger les fichiers `Dockerfile` et `go` dans un répertoire.

#### Construire le container

```sh
docker build -t="duniter" .
```

#### Exécuter le container

```sh
docker run -p 8999:8999 -dt duniter
````
