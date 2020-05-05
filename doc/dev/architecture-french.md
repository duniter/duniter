# Duniter architecture

Title: Duniter architecture
Order: 1
Date: 2020-05-04
Slug: architecture_fench
Authors: elois

## Deux langages : Rust & Typescript

Historiquement, Duniter était en pur javascript et propulsé par [NodeJs] (avec quelques addons en C/C++).

Entre temps, Duniter a été entièrement réécris en [Typescript].
Le [Typescript] est un langage de typage qui est ensuite "transpilé" en javascript.
Au runtime, c'est toujours du code javascript qui est interprété par [NodeJs], le code [Typescript] "disparait" à la compilation.

Duniter est actuellement en cours de migration du [Typescript] vers le [Rust].
Cette migration se fait progressivement via un binding [NodeJs]<->[Rust] assuré par [Neon].
le fait de migrer du code en [Rust] est communément nommée "oxydation", on parle donc de "l'oxydation de Duniter".

L'objectif à terme est d'oxyder entièrement Duniter, mais c'est un long processus qui va s'étaler sur plusieurs années.

## Deux variantes: server & desktop

La variante "server" est en ligne de commande et la variante "desktop" possède une interface graphique dans une fenêtre.
La variante "server" porte mal son nom car les deux variantes embarquent un serveur Duniter.

## Architecture du dépôt

Dossiers :

- `app/`: Code source Typescript.
- `bin/`: Point d'entrée de l'application. Actuellement c'est un script js, si l'oxydation deviens totale ce sera remplacé par une crate binaire.
- `doc/`: Documentation (en markdown).
- `gui/`: Page d'acceuil et icone pour la variante desktop.
- `images/`: Logo de Duniter dans differentes tailles et différents formats.
- `neon/`: Code pour le binding NodeJs<->Rust
- `release/`: Scripts de build des livrables et resources pour les livrables (systemd, completion bash, etc)
- `rust-libs/`: Code source Rust
- `test/`: Tests automatisés du code javascript

Si l'oxydation de duniter se fait jusqu'au bout, les dossiers `app/`, `neon/` et `test/` disparaitrons.
Les tests d'intégration de chaque crate rust se trouvent dans le sous-dossier tests du dossier de la crate.

[Neon]: https://neon-bindings.com/
[NodeJs]: https://nodejs.org/en/
[Rust]: https://www.rust-lang.org/
[Typescript]: https://www.typescriptlang.org/
