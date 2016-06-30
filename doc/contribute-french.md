## Introduction

Cet article est un tutoriel d'initiation au code source du logiciel Duniter. Celui-ci vous permettra, à travers une succession d'étapes, d'accéder à la maîtrise des outils et méthodes utilisés quotidiennement par les développeurs de Duniter pour créer et modifier le logiciel.

A la fin de ce tutoriel, vous serez donc *capable de modifier le logiciel*. Et si le cœur vous en dit, vous pourrez même réaliser une modification et partager celle-ci avec le dépôt de code principal, afin que celle-ci soit officiellement intégrée et disponible aux utilisateurs !

A vos claviers !

### Sommaire

* [Niveau I : récupérer le code source](#niveau-i-récupérer-le-code-source)
* [Niveau II : exécuter les tests unitaires](#niveau-ii-exécuter-les-tests-unitaires)
* [Niveau III : maîtriser les commandes usuelles](#niveau-iii-maîtriser-les-commandes-usuelles)
* [Niveau IV : dialoguer via l'API HTTP](#niveau-iv-dialoguer-via-lapi-http)
* [Niveau V : lancer et utiliser l'interface graphique](#niveau-v-lancer-et-utiliser-linterface-graphique)
* [Niveau VI : utiliser un Environnement de Développement Intégré (EDI)](#niveau-vi-utiliser-un-environnement-de-développement-intégré-edi)
* [Niveau VII : exécuter les tests unitaires via WebStorm](#niveau-vii-exécuter-les-tests-unitaires-via-webstorm)
* [Niveau VIII : lancer un test unitaire précis](#niveau-viii-lancer-un-test-unitaire-précis)
* [Niveau IX : lancer Duniter avec WebStorm](#niveau-ix-lancer-duniter-avec-webstorm)
* [Niveau X : observer l'exécution du code avec un point d'arrêt](#niveau-x-observer-lexécution-du-code-avec-un-point-darrêt)
* [Niveau XI : point d'arrêt d'une commande](#niveau-xi-point-darrêt-dune-commande)
* [Niveau XII : déboguer un appel HTTP](#niveau-xii-déboguer-un-appel-http)
* [Niveau XIII : résoudre un bug](#niveau-xiii-résoudre-un-bug)

## Niveau I : récupérer le code source

Ce premier niveau consiste à créer *votre propre version* des sources du logiciel et de récupérer cette copie sur votre ordinateur. Vous y produirez :

* votre propre compte *GitHub*
* votre propre version du logiciel, votre *fork*
* une copie locale des fichiers de code source provenant de votre *fork*

### Créez un compte GitHub

> Si vous disposez déjà d'un compte GitHub, vous pouvez passer cette étape.

Rendez-vous sur https://github.com (site en anglais). Renseigner les 3 champs proposés :

* Nom d'utilisateur
* E-mail
* Mot de passe

<img src="https://forum.duniter.org/uploads/default/original/1X/13ade346327b73bbf1acc97027af147eeb4e9089.png" width="346" height="325">

Vous recevrez probablement un e-mail de confirmation qu'il vous faudra valider. Une fois cette étape passée, vous devriez disposer d'un compte GitHub .
### Forkez le dépôt principal

> Si vous avez déjà forké le dépôt principal [ucoin-io/blog-posts](https://github.com/ucoin-io/blog-posts), vous pouvez passer cette étape.

Rendez-vous à l'adresse https://github.com/duniter/duniter. Cliquez sur le bouton « Fork » en dans le coin supérieur droit de la page :

<img src="https://forum.duniter.org/uploads/default/original/1X/3b9228c664520496d6a7e86e3f9c4c438f111914.png" width="388" height="98">

Vous aurez alors *votre propre version* du code de Duniter, dans *votre dépôt* GitHub :

<img src="https://forum.duniter.org/uploads/default/original/1X/24b813985e60aaf8916d783064ce3b28f305e288.png" width="229" height="114">

### Installer Git

L'installation de Git dépend de votre système d'exploitation. Suivez simplement les indications présentes sur : https://git-scm.com/

### Cloner votre fork

A ce stade, vous êtes en mesure de récupérer votre version du code source (votre *fork*), afin de pouvoir travailler dessus.

#### Ouvrez Git en ligne de commande

Pour récupérer le code source, lancez Git en mode console.

* Sous Linux et MacOS, ouvrez tout simplement le Terminal
* Sous Windows lancez le programme *Git Bash* :

<img src="https://forum.duniter.org/uploads/default/original/1X/6fc638dc0a22d88da7e84dbf0371e69747767f78.png" width="432" height="80">

#### Clonez votre fork

Retournez sur la page web GitHub, puis trouvez le bouton « Clone or download » :

<img src="https://forum.duniter.org/uploads/default/original/1X/b012974929db5ff5a1d6c16a85b061902a2ea830.png" width="492" height="117">

Cliquez dessus, vous pourrez alors copier l'URL de clonage en cliquant sur l'icône de valise :

<img src="https://forum.duniter.org/uploads/default/original/1X/2109dd11b2c3fb2ce78a438fb69fe54052612ad7.png" width="471" height="194">

Vous n'avez plus qu'à retourner dans votre console Git et saisir :

    git clone <coller l'URL copiée>

ce qui donne dans mon cas :

```
git clone https://github.com/c-geek/duniter.git
Cloning into 'duniter'...
remote: Counting objects: 19804, done.
remote: Compressing objects: 100% (88/88), done.
d 0 (delta 0), pack-reused 19715
Receiving objects: 100% (19804/19804), 8.08 MiB | 134.00 KiB/s, done.
Resolving deltas: 100% (13057/13057), done.
Checking connectivity... done.
```

Si vous êtes arrivés à un comportement similaire, **bravo**, vous posséder désormais le code source Duniter !

## Niveau II : exécuter les tests unitaires

Ce second niveau vise à obtenir les outils de base pour exécuter le code source, et vérifier son bon fonctionnement. Vous y réaliserez :

* l'installation du moteur d'exécution JavaScript *Node.js*
* la vérification du bon fonctionnement du code source *via* les Tests Unitaires (TU)

Si les tests passent, vous aurez dores et déjà un environnement entièrement **fonctionnel** !

### Installer Node.js

#### Sous Linux / MacOS

Installer Node.js est devenu extrêmement simple pour ces OS : un outil vous permet d'installer la version de Node.js que vous souhaitez, en changer quand vous voulez et sans conflit avec une version précédente : il s'agit de [nvm](https://github.com/creationix/nvm).

Vous pouvez installer nvm avec la commande suivante :

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
```

Fermez puis rouvrez votre terminal, comme indiqué. Puis, installez Node.js (choisissez la version 4) :

```bash
nvm install 4
```

Vous aurez alors la dernière version de la branche 4.x de Node.js prête à l'emploi.

##### Outils de build

Attention : il est nécessaire d'avoir `g++` ainsi que `python` d'installés ainsi que d'autres librairies de compilation. Sur Ubuntu/Debian, il existe un paquet installant ces différents utilitaires : installez-le avec la commande :

```bash
sudo apt-get install build-essential
```

#### Sous Windows

##### Node.js

Pour Windows, téléchargez la version 4 disponible sur le site officiel de Node.js : https://nodejs.org

<img src="https://forum.duniter.org/uploads/default/original/1X/f1c8e156e095f6af002eeaa093ee655c5c29f895.png" width="595" height="190">

Puis lancez l'installeur ainsi téléchargé.

##### Outils de build

###### Python

La compilation nécessite l'utilisation du logiciel Python, dans sa version 2.7. Allez donc sur [la page de téléchargement de Python](https://www.python.org/downloads/) puis téléchargez la version 2.7 :

<img src="https://forum.duniter.org/uploads/default/original/1X/09832e53bff449e01c2f6f9d58c84e1d2627353b.png" width="490" height="159">

Puis faites de même que pour Node.js : exécutez l'installeur téléchargé.

**Attention**: veillez à bien ajouter Python dans le PATH au moment de choisir les options d'installation :

<img src="https://forum.duniter.org/uploads/default/original/1X/a0684a5914ef221710f63f810f40e301888228cd.png" width="620" height="465">

En cliquant sur "Will be installed on local hard drive", la croix rouge devrait disparaître de la liste des éléments installés.

###### Visual Studio

Les utilisateurs de Windows devront également installer Visual Studio, qui contient le compilateur C++ de la plateforme Windows.

S'il est déjà installé sur votre poste et qu'il s'agit d'une version suffisamment récente (nous conseillons la version 2015), vous pouvez passer ce paragraphe.

Pour les autres, rendez-vous sur la page de téléchargement : https://www.visualstudio.com/fr-fr/downloads/download-visual-studio-vs.aspx

Vous pourrez alors choisir la version de Visual Studio qui vous convient. La version Community est suffisante, car elle intègre le compilateur C++ qui est la seule chose dont nous ayant besoin.

Une fois téléchargé l'installeur, procédez à l'installation. *Ne choisissez pas l'installation par défaut*, celle-ci ne contient pas l'outil de build C++. Choisissez l'option "Personnalisée" et cochez les options que vous voulez, avec le minimum requis nous concernant :

<img src="https://forum.duniter.org/uploads/default/original/1X/23d3ed26be03aef342a604721f572820d35da649.png" width="357" height="500">

### Installer les modules Node.js de Duniter

Duniter repose sur des librairies tierce pour fonctionner appelées *dépendances*, comme par exemple des librairies de cryptographie. En effet, nous n'avons pas tout recodé de zéro et n'avons que peu d'intérêt à le faire.

Et donc, le fait d'avoir cloné les sources n'est en réalité pas suffisant pour lancer l'application. Nous devons obtenir le code des dépendances pour obtenir ainsi l'ensemble du code exécutable du programme. Pour ce faire, retournez dans la console Git et déplacez-vous dans le répertoire cloné :

```bash
cd duniter
```

Puis, lancez le téléchargement et l'installation des modules Duniter à l'aide de la commande :

```bash
npm install
```

> Le processus d'installation peut prendre plusieurs minutes. En effet, il faut télécharger toutes les dépendances de Duniter et même en compiler certaines. C'est probablement le bon moment pour aller vous chercher un café !

Si tout s'est bien passé, vous devriez obtenir une fin d'arborescence dans la console, et l'invité de commande devrait vous avoir rendu la main :

```bash
+-- winston@2.1.1
| +-- async@1.0.0
| +-- colors@1.0.3
| +-- cycle@1.0.3
| +-- eyes@0.1.8
| +-- isstream@0.1.2
| +-- pkginfo@0.3.1
| `-- stack-trace@0.0.9
+-- wotb@0.4.10
`-- ws@1.0.1
  +-- options@0.0.6
  `-- ultron@1.0.2

npm WARN duniter@0.20.0-a84 license should be a valid SPDX license expression

cgeek@~$
```

> Il se peut que vous obteniez des messages `npm WARN [...]`. Rien de grave : comme le nom du message l'indique, il s'agit simplement d'un avertissement non bloquant pour la suite des événements.

### Lancer les tests

Moment fatidique ! Il ne vous reste plus qu'à lancer les tests pour savoir si tout s'est bien passé et que vous êtes prêts pour la suite. Lancez les tests avec la commande suivante :

```bash
npm test
```

Vous verrez alors défiler tous les tests unitaires de l'application. Il s'agit d'un code spécifique que nous avons écrit et qui permet de vérifier que le code de l'application est toujours stable dans le temps, malgré toutes les modifications que nous pouvons y apporter. Accessoirement, dans notre cas, cela permet aussi de vérifier que votre environnement est correctement configuré.

Si la commande se termine ainsi :

```bash
      ✓ a leaver who joins back should be enabled (225ms)
    Server 3
      ✓ two first commits: the WoT is new and OK (1051ms)
      ✓ third & fourth commits: toc should have joined (438ms)
      ✓ fifth commit: cat still here, but not its certs (280ms)
      ✓ sixth commit: cat is gone with its certs (140ms)
      ✓ seventh commit: toc is gone, but not its cert to tic (282ms)
      ✓ revert seventh commit: toc is back, cat is gone (84ms)
      ✓ revert sixth commit: cat is back (88ms)
      ✓ revert fifth commit (46ms)
      ✓ revert third & fourth commits (117ms)
      ✓ revert first & second commits (100ms)


  334 passing (1m)
```

Alors votre environnement est désormais prêt pour la suite du tutoriel !

## Niveau III : maîtriser les commandes usuelles

Ce troisième niveau permet de découvrir les quelques (cinq) commandes que vous utiliserez tout le temps si vous développez Duniter. Vous y apprendrez :

* à configurer Duniter
* à le lancer
* à le synchroniser à une monnaie existante
* à le remettre à neuf

### Lancer une commande Duniter

En mode développement, on utilise la syntaxe suivante dans la console Git ouverte précédemment :

```bash
node bin/ucoind <commande>
```

Par exemple pour démarrer le programme (ne le faites pas tout de suite !), on utilise :

```bash
node bin/ucoind start
```

Ici, le programme principal est `node` (Node.js). Il prend pour argument un fichier JavaScript (ici le fichier `ucoind` qui est un fichier JavaScript dont on a retiré l'extension `.js`) du dossier `bin/` qui est présent dans le code source, auquel on peut ajouter un ensemble d'arguments qui constitueront alors les arguments du programme JavaScript.

> On parler communément de programme Node.js pour désigner les programmes JavaScript tournant avec Node.js.

> Notez également que le fichier principal de *Duniter* est *ucoind*. Ce nom *ucoind* vient de *uCoin*, l'ancien nom du logiciel. Ne tenez pas rigueur de ce nom de fichier : bien qu'il fasse référence à l'ancien nom, il s'agit bien du programme principal de *Duniter*.

### Configuration avec les commandes `config` et `wizard`

Duniter a besoin d'une configuration minimale pour fonctionner, résumable en 2 points :

* une configuration réseau :
  * sur quelle interface réseau de l'ordinateur écouter ? et quel port ?
  * sur quelle IP internet mon instance est-elle joignable ? et quel port ?
* un trousseau de clés cryptographiques :
  * une clé publique
  * une clé privée

#### Configuration automatique avec `config`

Pour obtenir ces 2 éléments, le plus simple dans est d'utiliser la commande `config` avec l'option `--autoconf` qui tente de résoudre par elle-même ces 2 paramètres :

* la configuration réseau est automatiquement détecté
* une paire de clés cryptographiques est générée aléatoirement

Lancez donc la commande :

```bash
node bin/ucoind config --autoconf
2016-06-01T07:47:00+02:00 - debug: Plugging file system...
2016-06-01T07:47:00+02:00 - debug: Loading conf...
2016-06-01T07:47:00+02:00 - debug: Loading crypto functions...
2016-06-01T07:47:00+02:00 - info: Checking UPnP features...
2016-06-01T07:47:00+02:00 - info: Local IPv4: 192.168.1.28:21629
2016-06-01T07:47:00+02:00 - info: Remote IPv4: 88.174.120.187:21629
2016-06-01T07:47:00+02:00 - info: UPnP: Yes
2016-06-01T07:47:00+02:00 - info: DNS: No
2016-06-01T07:47:00+02:00 - info: Key: generated
2016-06-01T07:47:00+02:00 - debug: Configuration saved.
```

Vous devriez avoir une sortie similaire à l'exemple ci-dessus, avec des valeurs différentes. Votre logiciel Duniter est alors configuré.

**Notez la partie "Local IPv4" quelque part**, nous l'utiliserons dans la suite du tutoriel. Dans notre exemple `192.168.1.28:21629`.

> La commande `config` permet d'effectuer la totalité de la configuration en ligne de commande. Pour plus d'informations, consulter [le guide de la ligne de commande Duniter](https://forum.duniter.org/t/duniter-command-line-guide/903) (en cours de réalisation).

#### Configuration manuelle interactive avec `wizard`

Il est également possible de changer ses valeurs, soit avec la commande `config` et ses différentes options, soit avec la commande `wizard` qui a l'avantage d'être *interactive* : c'est-à-dire que vous allez pouvoir interagir avec la commande.

Par exemple si la configuration réseau ne vous convient pas, vous pouvez la modifier avec :


```bash
node bin/ucoind wizard network
```
```bash
2016-06-01T08:10:16+02:00 - debug: Plugging file system...
2016-06-01T08:10:16+02:00 - debug: Loading conf...
2016-06-01T08:10:17+02:00 - debug: Loading crypto functions...
2016-06-01T08:10:17+02:00 - info: Checking UPnP features...
? IPv4 interface: eth0 192.168.1.28
? IPv6 interface: None
? Port: 21629
? Remote IPv4: (Use arrow keys)
  None
  lo 127.0.0.1
  eth0 192.168.1.28
❯ 88.174.120.187
  Enter new one
```

Comme vous pouvez le constater, la commande vous demande de choisir des valeurs (IPv4, IPv6, port, IPv4 distante, ...). Notez que dans le cas précis de `wizard network`, la commande ne vous posera des questions que concernant la configuration réseau.

Vous pouvez donc changer d'autres parties de votre configuration, par exemple votre trousseau cryptographique avec la commande :

```bash
node bin/ucoind wizard key
```
```bash
2016-06-01T08:13:14+02:00 - debug: Plugging file system...
2016-06-01T08:13:14+02:00 - debug: Loading conf...
2016-06-01T08:13:14+02:00 - debug: Loading crypto functions...
? Key's salt: 897971160
? Key's password: (********)
```

#### Lancer l'application avec la commande `start`

Nous y sommes ! Il est *dores et déjà possible* de démarrer Duniter. Essayez, avec la commande `start` :

```bash
node bin/ucoind start
```
```bash
2016-06-01T08:16:24+02:00 - debug: Plugging file system...
2016-06-01T08:16:24+02:00 - debug: Loading conf...
2016-06-01T08:16:24+02:00 - debug: Loading crypto functions...
2016-06-01T08:16:25+02:00 - debug: Upgrade database...
2016-06-01T08:16:25+02:00 - debug: Upgrading from v0 to v1...
2016-06-01T08:16:25+02:00 - debug: Upgrading from v1 to v2...
2016-06-01T08:16:25+02:00 - debug: Upgrading from v2 to v3...
2016-06-01T08:16:25+02:00 - debug: Upgrading from v3 to v4...
2016-06-01T08:16:25+02:00 - info: >> NODE STARTING
2016-06-01T08:16:25+02:00 - info: UPnP: configuring...
2016-06-01T08:16:25+02:00 - trace: UPnP: mapping external port 44438 to local 44438...
2016-06-01T08:16:25+02:00 - error:  Error: No currency name was given.
```

Toutefois, vous tomberez alors sur une erreur ! `No currency name was given`.

En effet, pour des raisons historiques, le logiciel a absolument besoin de connaître le nom de la monnaie qu'il traite pour pouvoir être "lancé". C'est dommage, car dans l'absolu ce n'est pas vraiment nécessaire. Peut-être avons-nous là une 1ère amélioration à nous mettre sous la dent ?!

En tous les cas, nous pouvons palier à ce problème en *nous synchronisant à une monnaie existante* avec la commande `sync`.

#### Branchement sur une monnaie existante avec la commande `sync`

Cette commande permet à votre nœud de récupérer l'ensemble de la blockchain d'une monnaie Duniter existante, blockchain qui contient notamment le fameux paramètre "nom de la monnaie". Allons-y.

Exécutez la commande :

```bash
node bin/ucoind sync cgeek.fr 9330
```
```bash
Progress:

Download: [||||||||||||        ] 60 %
Apply:    [|||||||||||         ] 56 %

Status: Remaining a few seconds
```

Vous apercevrez alors un afficheur vous indiquant la progression du téléchargement et de l'application de la blockchain.

Une fois terminée, la commande affiche :

```bash
Progress:

Download: [||||||||||||||||||||] 100 %
Apply:    [||||||||||||||||||||] 100 %

Status: Peer TENGx7WtzFsTXwnbrPEvb6odX2WnqYcnnrjiiLvp1mS
All done.
```

Vous pouvez désormais relancer la commande `start` et observer votre nœud local fonctionner, branché sur une monnaie existante et son réseau !

#### Remettre ses données à zéro avec `reset`

Régulièrement, on peut souhaiter vouloir oublier une monnaie existante afin, par exemple, de créer une nouvelle monnaie localement sur son PC à des fins de test.

Pour ce faire, lancer simplement la commande `reset data` qui supprime *les données monétaires uniquement* (blockchain, nom de la monnaie, transactions, identitéss, ...)


```bash
node bin/ucoind reset data
```

Il existe également une commande plus large, qui supprime également votre configuration Duniter (réseau, trousseau cryptographique, ...) :

```bash
node bin/ucoind reset all
```

Voilà, vous connaissez désormais les commandes de base ! Allons maintenant voir comment dialoguer avec votre nœud fraîchement installé.

## Niveau IV : dialoguer via l'API HTTP

Ce 4ème niveau vous amènera à *dialoguer* avec votre nœud une fois lancé. En effet, celui-ci écoute le réseau à travers une API HTTP, nommée [Basic Merkled API (BMA)](https://github.com/duniter/duniter/blob/master/doc/HTTP_API.md). C'est cette via cette interface HTTP que les noeuds dialoguent entre eux, et il est tout à fait possible pour nous de faire de même via un navigateur web : celui-ci est un spécialiste pour faire des requêtes HTTP.

Vous réaliserez donc ici :

* comment accéder à l'API HTTP de votre nœud via votre navigateur web
* l'observation de quelques URI importantes de l'API (des « méthodes web »)
* la consultation du document technique décrivant cette API pour vos futures utilisations

### Préparez votre navigateur

Dans ce tutoriel, nous observerons des réponses HTTP au format JSON. Il est important que votre navigateur soit capable de vous afficher ce résultat de façon convenable, incluant une coloration et une indentation facilitant la lecture de ces résultats davantage destinés aux machines, par exemple comme ceci :

<img src="https://forum.duniter.org/uploads/default/original/1X/148f35a7885eccca8dd1015fddb58bffafe3d99a.png" width="690" height="183">

#### Firefox

Pour ce navigateur, installez simplement le module [JSONView](https://addons.mozilla.org/fr/firefox/addon/jsonview/)

#### Chrome

Il existe la même extension pour Chrome : [JSONView](https://chrome.google.com/webstore/detail/jsonview/chklaanhfefbnpoihckbnefhakgolnmc)

#### Autres navigateurs

Nous vous conseillons l'utilisation de Firefox ou Chrome pour ce tutoriel, toutefois si vous préférez utiliser un autre navigateur, nous vous laissons trouver l'extension appropriée.

### Repérer le point d'écoute de votre nœud

La toute 1ère chose à faire est de connaître l'interface et le port d'écoute de votre nœud pour pouvoir lui envoyer des requête HTTP.

Vous l'avez normalement noté lors de la commande `config --autoconf`. Toutefois si vous ne l'avez pas fait, vous pouvez toujours retrouver votre configuration dans le dossier

```text
`~/.config/duniter/duniter_default/conf.json`
```

C'est ce fichier qui contient toute votre configuration : réseau, trousseau cryptographique, etc. En cas de trou de mémoire, allez simplement consulter ce fichier.

Pour rappel, dans cet exemple nous utilisons l'interface `192.168.1.28:21629`. **La vôtre est différente**, mais notez-là car nous allons l'utiliser.

### Lancez votre noeud

La seconde étape est de lancer votre noeud avec la commande :

```bash
node bin/ucoind start
```

### Consulter l'URI `/node/summary`

Votre nœud devrait écouter le réseau actuellement. Vous pouvez le vérifier en essayant l'URL suivante dans votre navigateur web :

```text
http://<votre_interface>/node/summary
```

Pour notre configuration, il s'agira précisément de :

```text
http://192.168.1.28:21629/node/summary
```

Le résultat devrait alors être :

```json
{
  "duniter": {
    "software": "duniter",
    "version": "0.20.0a84",
    "forkWindowSize": 100
  }
}
```

Qu'est-ce à dire ? Nous voyons ici un résultat au format JSON, incluant plusieurs champs. Nous voyons entre autres :

* le logiciel utilisé `duniter`
* la version du logiciel `0.20.0a84`
* un autre paramètre obscur `forkWindowSize`

Ces valeurs ont été retournées par votre nœud local, c'est celui-ci qui a répondu à votre requête. D'ailleurs vous pouvez vérifier cela en coupant votre noeud (avec `Ctrl + ^C` par exemple) et en actualisant la page. Celle-ci devrait s'afficher en erreur, puisque votre nœud est alors éteint.

Et donc, votre noeud a répondu cela en conséquence de votre appel à l'URI particulière `/node/summary`. Si vous testez d'autres URIs, les résultats seront différents. Voyons-en d'autres.

### Le block courant ave `/blockchain/current`

Essayons cette URL :

```text
http://<votre_interface>/blockchain/current
```

Nous obtenons alors une réponse qui contient un *bloc*, c'est une entité fondamentale de la blockchain de Duniter :

```json

{
  "version": 2,
  "nonce": 8090,
  "number": 10690,
  "powMin": 73,
  "time": 1464775226,
  "medianTime": 1464774454,
  "membersCount": 23,
  "monetaryMass": 89602406,
  "unitbase": 0,
  "currency": "test_net",
  "issuer": "HGYV5C16mrdvE9vpb1S9nMDHkVPsubBgANs9pSb6HWCV",
  "signature": "zSljSw2JT/2ygFjqn6bDnvx0q2H1GEoRjW1yRbXGJEJH8Mc1CI4MIMfs2yOJCT2iK709T6vzyr8MOuUrdo4WBg==",
  "hash": "0000092B3151446CB434ADEA0C41710462D2DDF34DA87258C306DF5F8404FA77",
  "parameters": "",
  "previousHash": "0000154AAA5037E2124D95512DC7CC6763B0494B4B3A7182F0430C2450ED228F",
  "previousIssuer": "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU",
  "inner_hash": "9FE8C15157D4F6B27E8F55711908BE0758BA162AA9FFF6050D6E91FE10088F8A",
  "dividend": null,
  "identities": [],
  "joiners": [],
  "actives": [],
  "leavers": [],
  "revoked": [],
  "excluded": [],
  "certifications": [],
  "transactions": [],
  "raw": "Version: 2\nType: Block\nCurrency: test_net\nNumber: 10690\nPoWMin: 73\nTime: 1464775226\nMedianTime: 1464774454\nIssuer: HGYV5C16mrdvE9vpb1S9nMDHkVPsubBgANs9pSb6HWCV\nPreviousHash: 0000154AAA5037E2124D95512DC7CC6763B0494B4B3A7182F0430C2450ED228F\nPreviousIssuer: 8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU\nMembersCount: 23\nIdentities:\nJoiners:\nActives:\nLeavers:\nRevoked:\nExcluded:\nCertifications:\nTransactions:\nInnerHash: 9FE8C15157D4F6B27E8F55711908BE0758BA162AA9FFF6050D6E91FE10088F8A\nNonce: 8090\n"
}
```

Nous pouvons voir beaucoup de champs, et notamment le nom de la monnaie : `"test_net"`. Ici, le block renvoyé est le *bloc courant*; c'est-à-dire le dernier bloc actuellement connu et ajouté à la blockchain enregistrée par votre nœud.

Le numéro du bloc courant ci-dessus est `10690`. Il est également possible de consulter des blocs précédents, juste en connaissant leur numéro.

> La blockchain est constituée de blocs numérotés selon une séquence débutant à zéro. Donc si le bloc courant est le #10690, cela signifie que vous pouvez consulter potentiellement 10691 blocs (0 à 10690). Essayons l'un d'entre eux.

### Consulter un bloc en particulier avec `/blockchain/block/[number]`

Cette URI comporte un paramètre `number`, ce que ne comportaient pas les 2 URIs précédentes. Le contenu va donc varier en fonction de ce paramètre, ici on obtiendra le bloc correspondant à ce numéro. Essayons :


```text
http://<votre_interface>/blockchain/block/0
```

Résultat :

```json

{
  "version": 2,
  "nonce": 1,
  "number": 0,
  "powMin": 0,
  "time": 1461847383,
  "medianTime": 1461847383,
  "membersCount": 2,
  "monetaryMass": 0,
  "unitbase": 0,
  "currency": "test_net",
  "issuer": "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk",
  "signature": "5n/iTizVwZRjcl+0Mk6QrpZp2TC1K08cKMnYZJp4EnWC19CIIFkKsO+0C89AW5l/Y9WWD950MQNIV0GNcdXHBA==",
  "hash": "B87B0290DB5F1AD58461148815484797EF4DFF691E3169781AE98746CDD5E7BF",
  "parameters": "0.1:86400:100000:10800:40:2629800:31557600:1:604800:604800:0.9:15778800:5:12:300:25:40:0.66",
  "previousHash": null,
  "previousIssuer": null,
  "inner_hash": "8A968CD834325A111F87405A35374410C9F7501C779B38C15054071314BFD8B8",
  "dividend": null,
  "identities": [
    "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:3dKSxFRyNgkwwIbW/cx/37ky+Ttc3Wen8cE9iNW00IAp0XvvLM91b0avnP1gj9YJC893k8xCZmgTwE3WSmp1Aw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cgeek",
    "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:pvkFdhOzatUMqZfO6brlz6rbFQrJwS6Kwj3AVmvsBfw0AFQB8U8j5b/0zaAhwUMIC8wGNcxjXQsBpD5ASgZYCQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:moul"
  ],
  "joiners": [
    "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:bHhd8weRHbFBVNp9ZEzTX6OEBxT9M/2uc1/lZeaEr2pJgzjtZlAKxRW+xouvBJNSSxWnQU3kI+3D7SKJcAFFDQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cgeek",
    "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:g8UxgV7u5gBdfcHtFYitobIKnJyjD9XafwWXIRQXTz9UXwLUBgV3NmPNBVipPSDdGWWiHmpXDtoBcjAlcNCwAw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:moul"
  ],
  "actives": [],
  "leavers": [],
  "revoked": [],
  "excluded": [],
  "certifications": [
    "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:0:N4fX7zJsQFMLEk5OhqT1nb78VPA0yxGmOrVqiS7cC+eKSBi3cpU68VGFGIeUvkZuWZ8KzpuUI6nNWMDTtE0/Dw==",
    "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:0:0Yg7C8b1VVwqhFD97vL8ul4N5mGQe0N8WfjN/KvwFjwqoB2G/AlxLpuRi2kVPgCIjH6DufWfffsA8duyPnfwAg=="
  ],
  "transactions": [],
  "raw": "Version: 2\nType: Block\nCurrency: test_net\nNumber: 0\nPoWMin: 0\nTime: 1461847383\nMedianTime: 1461847383\nIssuer: HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk\nParameters: 0.1:86400:100000:10800:40:2629800:31557600:1:604800:604800:0.9:15778800:5:12:300:25:40:0.66\nMembersCount: 2\nIdentities:\nHnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:3dKSxFRyNgkwwIbW/cx/37ky+Ttc3Wen8cE9iNW00IAp0XvvLM91b0avnP1gj9YJC893k8xCZmgTwE3WSmp1Aw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cgeek\nJ78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:pvkFdhOzatUMqZfO6brlz6rbFQrJwS6Kwj3AVmvsBfw0AFQB8U8j5b/0zaAhwUMIC8wGNcxjXQsBpD5ASgZYCQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:moul\nJoiners:\nHnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:bHhd8weRHbFBVNp9ZEzTX6OEBxT9M/2uc1/lZeaEr2pJgzjtZlAKxRW+xouvBJNSSxWnQU3kI+3D7SKJcAFFDQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cgeek\nJ78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:g8UxgV7u5gBdfcHtFYitobIKnJyjD9XafwWXIRQXTz9UXwLUBgV3NmPNBVipPSDdGWWiHmpXDtoBcjAlcNCwAw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:moul\nActives:\nLeavers:\nRevoked:\nExcluded:\nCertifications:\nJ78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:0:N4fX7zJsQFMLEk5OhqT1nb78VPA0yxGmOrVqiS7cC+eKSBi3cpU68VGFGIeUvkZuWZ8KzpuUI6nNWMDTtE0/Dw==\nHnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:0:0Yg7C8b1VVwqhFD97vL8ul4N5mGQe0N8WfjN/KvwFjwqoB2G/AlxLpuRi2kVPgCIjH6DufWfffsA8duyPnfwAg==\nTransactions:\nInnerHash: 8A968CD834325A111F87405A35374410C9F7501C779B38C15054071314BFD8B8\nNonce: 1\n"
}
```

Nous voyons ici le tout premier bloc de la blockchain *test_net* ! On peut notamment y voir 2 identités (champ `identities`), 2 certifications (champ `certifications`) mais aussi les paramètres de la monnaie (champ `parameters`).

> Le bloc#0 est le seul à contenir les paramètres de la monnaie. Cela est définit dans [le protocole de Duniter](https://github.com/duniter/duniter/blob/master/doc/Protocol.md#parameters).

### D'autres données à consulter

Nous n'allons pas faire le tour de l'ensemble des méthodes disponibles, mais vous pouvez vous-même les découvrir en lisant [le document technique de l'API HTTP](https://github.com/duniter/duniter/blob/master/doc/HTTP_API.md).

Entres méthodes intéressantes, on pourra noter :

* `/wot/members` qui donne la liste des membres actuels de la monnaie
* `/wot/lookup/[recherche]` qui permet de réaliser une recherche sur une identité publiée sur un noeud
* `/tx/sources/[cle_publique]` qui permet d'obtenir la liste des sources de monnaie dont bénéficie une clé

Bien évidemment, c'est à vous de juger ce qui vous est intéressant ou non selon vos besoins de développement !

### Résumé

Nous avons donc pu observer notre noeud configuré puis lancé en ligne de commande, et dialogué avec celui-ci via des requêtes HTTP à l'aide d'un navigateur web.

Mais ce n'est pas la seule façon d'utiliser Duniter ! Celui-ci possède notamment une interface graphique qui peut très largement être préférée, même durant le développement. Voyons cela.

## Niveau V : lancer et utiliser l'interface graphique

Vous êtes désormais capables d'utiliser Duniter en ligne de commande dans un environnement de développement, et connaissez quelques méthodes web disponibles sur chaque nœud, que vous êtes en mesure d'interroger.

Tout cela est très bien, mais disposer d'une interface homme machine (IHM) un peu plus conviviale que la ligne de commande + des requêtes HTTP GET pour lire du JSON dans un navigateur web, ce serait quand même pas mal.

Or [depuis peu](https://fr.duniter.org/ucoin-rename-duniter/#uneinterfacegraphique), Duniter dispose d'une interface graphique :

<img src="https://forum.duniter.org/uploads/default/original/1X/37d71615f7dea90004d65ea4cc1e4dd4f205bba7.png" width="553" height="500">

Un œil averti remarquera que cette interface graphique ressemble bien plus à une interface web plutôt qu'à un programme du bureau. C'est en effet le cas : l'interface graphique de Duniter n'est rien d'autre qu'une application web, un « site web » diraient les anciens. Mais avec une seule page à charger, et dont le contenu est rendu dynamique grâce à JavaScript (encore ! Duniter est décidémement un projet *pur JS*).

### Installer l'interface graphique

En l'état actuel de votre dossier de code source, l'interface graphique n'est pas disponible. Elle se présente sous la forme d'un sous-module Git qu'il convient de « tirer » pour en obtenir le code. Pour ce faire, lancer les commandes suivantes :

```bash
git submodule init
git submodule update
```

Vous avez désormais récupéré le code source de l'IHM dans le dossier `web-ui/` du dossier `duniter/`. Il faut désormais la « compiler » pour en obtenir une version exploitable par Duniter :

```bash
cd web-ui
npm install
cd ..
```

Au terme de ces commandes, vous devriez obtenir un sous-dossier `public/` dans `web-ui/`. Ce dossier contient les différents fichiers HTML/CSS/JS générés à partir des sources de `web-ui/`.

### Lancer Duniter avec son interface graphique

Tout est prêt, il ne reste plus qu'à lancer Duniter ! Cependant, nous ne le ferons pas avec la commande `start` mais avec la commande `webwait`.

```bash
node bin/ucoind webwait
```
```text
2016-06-01T13:53:18+02:00 - debug: Plugging file system...
2016-06-01T13:53:20+02:00 - info: Duniter web admin listening on http://localhost:9220
2016-06-01T13:53:20+02:00 - debug: Loading conf...
2016-06-01T13:53:20+02:00 - debug: Loading crypto functions...
2016-06-01T13:53:21+02:00 - debug: Upgrade database...
2016-06-01T13:53:21+02:00 - debug: Upgrading from v0 to v1...
2016-06-01T13:53:21+02:00 - debug: Upgrading from v1 to v2...
2016-06-01T13:53:21+02:00 - debug: Upgrading from v2 to v3...
2016-06-01T13:53:21+02:00 - debug: Upgrading from v3 to v4...
```

Voyez les logs de sortie : l'application écoute sur l'interface réseau `localhost:9220`. Si vous vous rendez à cette adresse via votre navigateur, vous accéderez alors à l'interface graphique de Duniter :

<img src="https://forum.duniter.org/uploads/default/original/1X/da85741a37d2efb912a0e6cd15616421ace1ca86.png" width="690" height="411">

> Dès lors que vous aurez accédé à l'IHM, voyez comme les logs de la console s'affolent comme si la commande `start` avait été lancée. C'est en fait le cas : la commande `webwait` est permet d'attendre l'IHM pour démarrer le fonctionnement monétaire du nœud. Pour être tout à fait exact : c'est l'IHM elle-même qui le démarre.

### Comparaison des fonctionnalités

L'IHM permet globalement de faire les mêmes choses que la ligne de commande :

* le menu `Settings > Data` équivaut à la commande `reset data`, car elle permet de remettre à zéro les données locales (et redirige même vers un écran de synchronisation, donc équivalence avec la commande `sync`)
* le menu `Settings > Crypto` équivaut à `wizard key`, car elle permet de changer le trousseau du nœud
* le menu `Settings > Network` équivaut à `wizard networkcar elle permet de changer la configuration réseau
* enfin, on peut même trouver dans le coin supérieur droit un menu permettant de stopper / démarrer le serveur, équivalence avec la commande `start`

Mais les 2 modes d'utilisations permettent des usages différents, ainsi il est parfois plus simple d'utiliser la ligne de commande pour forcer la valeur d'un paramètre (exemple : `--cpu`) que d'utiliser l'IHM qui ne le permet pas encore.

De même l'IHM permet des usages nouveaux par rapport à la ligne de commande, comme l'affichage de graphiques.

Il s'agit donc d'interfaces complémentaires, et développer Duniter consiste à se servir des 2 conjointement.

### Utilisation de l'API HTTP

#### L'API classique (BMA)

En ayant lancé l'IHM, vous avez également lancé le fonctionnement "monétaire" de votre noeud : celui-ci est donc toujours accessible *via* les URIs que nous avons vues dans le niveau IV. Vous pouvez tester cela tout de suite avec en accédant par exemple :

```bash
http://<votre_interface>/blockchain/current
```

#### L'API de gestion du nœud

Comme nous venons de le dire, c'est bien l'IHM qui pilote le nœud, pas l'inverse. Celui met en réalité à disposition de l'IHM une API HTTP semblable à l'API classique, mais spécialisée dans le contrôle du nœud.

*Cette API est donc sensible*.

Vous aurez remarqué que pour y accéder, nous passons par http://localhost:9220. Ce n'est pas par hasard : cette API *ne doit être accessible qu'à vous !* Quiconque a accès à l'IHM ou à l'API de gestion peut contrôler votre nœud.

Cette API ne dispose pas pour le moment de documentation, et par ailleurs ce tutoriel ne vise pas le développement de l'IHM ni de son API. Ceci pourra faire l'objet d'un ajout ultérieur.

## Niveau VI : utiliser un Environnement de Développement Intégré (EDI)

Pour un confort de développement et une efficacité maximum, on utilise généralement un EDI qui facilite grandement nos tâches quotidiennes comme déboguer le code, comparer nos fichiers avec une version précédente, détecter des erreurs automatiquement (variable non déclarée, condition booléenne toujours fausse, erreur de syntaxe, ...) ou naviguer dans le code par simple clic sur les noms de variables ou de fonctions.

Pour développer en Node.js, nous choisissons d'utiliser [WebStorm de JetBrains](https://www.jetbrains.com/webstorm/).
> WebStorm *n'est pas un logiciel libre.* Toutefois, il n'existe pas aujourd'hui d'équivalent libre de ce logiciel aux très nombreux atouts.
>
> De plus, ce logiciel est payant mais il peut être utilisé pendant 30 jours gratuitement. Aussi cela suffit pour suivre ce tutoriel.
>
> Mais si vous souhaitez poursuivre les développements, alors :
>
> * Le coût pour un individu est [peu cher la 1ère année](https://www.jetbrains.com/webstorm/buy/#edition=personal).
> * De plus, il est également **gratuit pour les projets OpenSource** qui peuvent bénéficier de licences accordées sur demande par JetBrains. Duniter bénéficie déjà de 2 licences, dont 1 est disponible, et si vous décidez de vous investir dans le logiciel, nous pourrons en obtenir une spécialement pour vous.
> * Et si vraiment, vraiment ... vous ne voulez pas payer et préférez les *logiciels libres sinon rien*, alors vous pourrez toujours utiliser d'autres outils pour développer. Vous pourrez par exemple utiliser [node-inspector](https://github.com/node-inspector/node-inspector) pour déboguer et [Atom](https://atom.io/) comme éditeur de code source, tout en utilisant [git-cola](https://git-cola.github.io/) comme outil graphique pour la gestion du code source. *Mais n'allez dans cette direction qu'en étant suffisamment expérimenté en tant que développeur, au risque de vous perdre !*

Ne sous-estimez pas l'impact d'un EDI, les possibilités apportées par ce genre d'outil peuvent créer un énorme fossé entre deux développeurs, selon que l'un d'eux utilise ce type d'outil ou non. Aide à la saisie, visualisation du code (dans l'espace : accès rapide à l'ensemble des fichiers, et dans le temps avec l'historique du code source intégré), débogage à l'exécution, validation et partage rapide du code sont autant de fonctions qui changent crucialement votre rapport au code, et donc au logiciel final.

Dans ce niveau spécial, vous apprendrez :

* à ouvrir votre code source à l'aide de WebStorm
* à configurer WebStorm pour une utilisation avec Node.js

### Installation de WebStorm

Vous pouvez télécharger WebStorm à cette adresse : https://www.jetbrains.com/webstorm/

#### Installation Linux

Décompressez le fichier téléchargé, puis ouvrez un terminal dans le sous-dossier `bin/` de WebStorm. Là, exécutez simplement le fichier `webstorm.sh` :

```bash
./webstorm.sh
```

L'EDI va alors s'ouvrir, et vous pourrez conserver l'icône de lancement dans le lanceur Unity.

#### Installation Windows

Lancez simplement l'installeur qui ajoutera WebStorm à vos programmes. Puis lancez- le.

### Ouvrir le projet `duniter`

Au premier lancement de WebStorm, outre l'acceptation de la période d'essai de 30 jours, vous obtiendrez la fenêtre suivante :

<img src="https://forum.duniter.org/uploads/default/original/1X/5d0b84e9b8bb7361abb8f5e5cfdb974e464ace64.png" width="474" height="429">

Cliquez alors sur « Open » puis ouvrez le dossier `duniter` contenant vos fichiers sources :

<img src="https://forum.duniter.org/uploads/default/original/1X/7e2276e1387a944306565bc096682302eddd640b.png" width="424" height="494">

Cliquez alors sur « OK » pour que WebStorm ouvre le projet.

#### Découverte de l'environnement

Vous devriez obtenir une fenêtre avec simplement le dossier projet `duniter` dans la partie gauche, ainsi qu'une zone principale quasi-vide incluant quelques raccourcis clavier.

Si vous déployez l'arborescence du dossier `duniter/`, vous obtenez une vision comme celle-ci :

<img src="https://forum.duniter.org/uploads/default/original/1X/f4f1c1a59fdf0049fa77b8b2fe4c58a0aa306093.png" width="690" height="473">

Il est déjà plus simple de se repérer dans les fichiers source.

#### Ouverture d'un premier fichier

Ouvrez le fichier que nous utilisons depuis le début : `bin/ucoind`. Vous constaterez qu'il s'agit en effet d'un fichier JavaScript, puisque son code est effectivement lisible et correspond à du JS :

<img src="https://forum.duniter.org/uploads/default/original/1X/9e416926421d7e9ac0580c9683e196e1a7212462.png" width="690" height="473">

#### Configurer le projet pour Duniter

Vous pouvez voir que WebStorm souligne les instructions `require` dans le code, ainsi que la chaîne de caractères `EADDRNOTAVAIL` par exemple, et de surcroît affiche plein de traits rouges dans la zone d’ascenseur. Configurons un peu plus WebStorm afin de nettoyer tout cela.

Rendez-vous dans `File > Settings..`, puis dans la zone de recherche du coin supérieur gauche tapez "Lib" :

<img src="https://forum.duniter.org/uploads/default/original/1X/5b7e573c03979a2b96218a14c3a9561fc9ae2599.png" width="690" height="479">

Ici, *cochez* "mocha-DefinitelyTyped" :

<img src="https://forum.duniter.org/uploads/default/original/1X/acfed5a33a6880f265b3d9698be9a47832083beb.png" width="690" height="479">

Cliquez ensuite dans JavaScript dans le menu de gauche puis sélectionnez "ECMAScript 6" dans la liste déroulante :

<img src="https://forum.duniter.org/uploads/default/original/1X/9160c54c02047e0fb35b98c9c62c3d29db03b316.png" width="690" height="479">

Poursuivez en changeant la valeur de recherche pour "Node" et sélectionnez "Node.js and NPM" dans le menu latéral gauche.

Sélectionnez alors dans la liste l'interpréteur Node.js que vous avez installé (4.x), puis cliquez sur le bouton "Enable" qu'il convient de cliquer afin d'obtenir la configuration suivante :

<img src="https://forum.duniter.org/uploads/default/original/1X/585c681321e4a61e58d3ba850909310c7350fe01.png" width="690" height="479">

Enfin, désactivons le soulignement typographique en changeant la recherche pour "Typo", puis dans le menu "Inspections" décochez la case "Spelling" :

<img src="https://forum.duniter.org/uploads/default/original/1X/317f3790b3af9041b6cfb142f4dc7363473c2213.png" width="690" height="479">

Pour terminer, cliquez sur "OK".

#### Désactiver le watcher Babel

Etant donné que nous développons du JavaScript en norme ECMAScript 6, WebStorm propose de transpiler notre code en ECMAScript 5 (c'est-à-dire, transformer le code ES6 récent et à peine supporté par les navigateurs en ES5 qui lui est supporté). Refusez cela en cliquant sur "Dismiss" dans la barre de notification verte :

<img src="https://forum.duniter.org/uploads/default/original/1X/0f53272a6243904dc6ad7c89e9dcf534fe636d39.png" width="690" height="90">

Voilà, fini les lignes rouges et soulignages inutiles, avec désormais les instructions Node.js reconnues. Nous voilà fin prêts :

<img src="https://forum.duniter.org/uploads/default/original/1X/d89fa6d996217b2ade816e0c139709df21004658.png" width="690" height="473">

## Niveau VII : exécuter les tests unitaires via WebStorm

Voici le premier vrai niveau d'utilisation dans WebStorm : être capable de lancer les tests unitaires comme nous avons pu le faire en ligne de commande. Comment procéder ? Commencez par cliquer sur la liste déroulante dans le coin supérieur droit de l'EDI :

<img src="https://forum.duniter.org/uploads/default/original/1X/5a58dae98d9c7f58a926ace9baf4f1c1ac9a14ec.png" width="240" height="71">

puis cliquez sur "Edit Configurations...". Là, cliquez sur le bouton "+" tout à gauche et choisissez "Mocha" dans la liste : il s'agit de l'outil de test unitaires de Duniter :

<img src="https://forum.duniter.org/uploads/default/original/1X/063475258b7417d1d574cb1284463df36755288d.png" width="273" height="241">

Ici, renseignez simplement 2 paramètres :

* `Extra Mocha options` à `--timeout 20000`
* Cochez `Include subdirectories

<img src="https://forum.duniter.org/uploads/default/original/1X/4edfedce3086215f47ecc5d02f18863578c4d72e.png" width="413" height="137">

Puis, donnez un nom à cette configuration, par exemple "Tous les tests" :

<img src="https://forum.duniter.org/uploads/default/original/1X/550b02b7946426eaa7b489134e49ce77d8df9d44.png" width="680" height="274">

Enfin, cliquez sur "OK".

### Lancer les tests

Dans la barre de configurations d'exécutions, cliquez sur le bouton "Lecture" en ayant bien pris soin de vérifier que c'est bien la configuration "Tous les tests" qui est sélectionné dans la liste déroulante, comme ceci :

<img src="https://forum.duniter.org/uploads/default/original/1X/4eb95748ae78466f00aa3966ce08fbdac10a1bd5.png" width="322" height="92">

Les tests devraient alors tous être lancés, et vous devriez apercevoir leur déroulement dans une fenêtre inférieure de l'EDI :

<img src="https://forum.duniter.org/uploads/default/original/1X/f46ab46d110332b2b1db5a47ad8f5c9d88fc6caf.png" width="690" height="473">

Si tout s'est bien passé, vous obtenez un message de succès dans cette même fenêtre :

<img src="https://forum.duniter.org/uploads/default/original/1X/e2022e081dbae900e9648d3bb9172d89018ad329.png" width="690" height="473">

Félicitations, votre EDI est correctement configuré ! Allons au niveau suivant !

## Niveau VIII : lancer un test unitaire précis

Comme vous avez pu le remarquer, lancer la totalité des tests unitaires prend un certain temps. Pendant les développements, nous travaillons en général sur une fonctionnalité ou un bug précis. Aussi, nous ne lançons la totalité des tests qu'à la fin de nos développements, juste avant de *commiter* (d'ajouter les modifications dans l'historique de code Git).

### Lancer un test à partir d'un fichier

A la place, nous lançons *un seul* fichier de test qui concerne le bug ou la fonctionnalité développée. Imaginons par exemple que nous développions un code assurant la validité du format d'une transaction Duniter. Alors, il est possible de lancer le fichier de test associé : `test/fast/tx_format.js` (c'est un code que nous avons déjà commencé à réaliser). Faites un clic droit sur le fichier puis lancez le test unitaire en choisissant le menu "Run" :

<img src="https://forum.duniter.org/uploads/default/original/1X/e3d9901bd7379dbb4721287071a0a1027b17e15e.png" width="430" height="100">

Ce test a été un succès et réalisé en 5 ms. Parfait !

### Savoir qu'un fichier permet de lancer un test

WebStorm précise qu'un fichier peut être exécuté comme un test à l'aide d'un pictogramme : regardez bien cette imprssion d'écran :

<img src="https://forum.duniter.org/uploads/default/original/1X/09047a30fc8bc51b387dbb14522f9943c94a8eb2.png" width="180" height="88">

On peut voir que le fichier `tx_format` possède une icône de lancement (picto rouge et vert), tandis que le fichier `eslint.js` n'en possède pas. Et effectivement, si l'on tente de lancer le fichier `eslint.js` , WebStorm nous indique une erreur !

<img src="https://forum.duniter.org/uploads/default/original/1X/d1e8de56b9a0c02a0623840c5a3da84bc9b46f13.png" width="534" height="132">

Les tests ne concernent donc que les fichiers avec ce pictogramme. Pas la peine d'essayer de lancer les autres de la même façon ! Sauf ... le fichier `bin/ucoind`, comme nous allons le voir au niveau IX !

## Niveau IX : lancer Duniter avec WebStorm

La procédure est similaire à l'ajout d'une configuration que nous avons faite au niveau VII. Dans la liste des configurations de lancement, cliquez sur la flèche de la liste déroulante et cliquez sur « Edit Configurations.. ». Cliquez de nouveau sur le bouton "+" afin d'ajouter une configuration Node.js cette fois :

<img src="https://forum.duniter.org/uploads/default/original/1X/385e4d798e6f558127ef87b66591a85b918d9e7c.png" width="248" height="239">

Saisissez les paramètres de configuration suivants :

<img src="https://forum.duniter.org/uploads/default/original/1X/7939db05c5b4ebc1ce224eb3cf4e9436d03f0014.png" width="690" height="258">

Ici nous avons simplement renseigné 3 paramètres :

* le champ `Name` pour donner un nom à cette configuration, nom qui se trouvera dans la liste déroulante des configurations disponibles
* le champ `JavaScript file` qui indique à Node.js quel fichier JS exécuter
* le champ `Application parameters` qui constitue les paramètres de commande Duniter

Cliquez sur "OK". Puis, lancez la configuration avec le bouton "Play" :

<img src="https://forum.duniter.org/uploads/default/original/1X/910210a34c05fe65133a18e1555b1f41e404331c.png" width="301" height="34">

La console WebStorm affiche alors la même sortie console que l'on pouvait obtenir plus tôt en ligne de commande :

<img src="https://forum.duniter.org/uploads/default/original/1X/3eda5fd2524c9a2a6cb5e7b0c1ca6c5e09ac77d8.png" width="690" height="169">

Bien évidemment, si vous vous rendez à l'adresse http://localhost:9220, alors vous vous retrouverez sur l'IHM de Duniter comme précédemment ! Il s'agit du même code, mais exécuté cette fois en passant par WebStorm.

Voyons désormais le plus gros intérêt à faire cela "passer par WebStorm" : les points d'arrêts.

## Niveau X : observer l'exécution du code avec un point d'arrêt

Il s'agit là probablement de la chose la plus puissante qu'un outil de développement, et par la même le développeur, puisse faire : ajouter un point d'arrêt dans son programme.

Pour rappel, cela permet de mettre littéralement le programme en pause. Mais petit supplément chocolat : on peut absolument **tout voir de l'état de son code** : contenu des variables, emplacement dans la pile d'appel, écriture de cod à la volée en tenant compte des variables disponibles, et j'en passe.

Bref, le point d'arrêt est un outil à vénérer. Voyons comment l'utiliser dans WebStorm.

### Le cas du fichier de test `perring.js`

Prenons ce fichier du fait de sa simplicité. Il se situe à côté du fichier `tx_format` utilisé plus tôt.

Ajoutez un point d'arrêt en faisant un clic gauche dans la partie noire ligne 31. Vous obtenez alors ceci :

<img src="https://forum.duniter.org/uploads/default/original/1X/39f209155f4e969cd060ac475738a5a7f186cca5.png" width="402" height="57">

Lancez-le alors le ficher `peering.js` en faisant un clic droit dessus puis en sélectionnant "Debug 'perring.js'". WebStorm lancera alors le fichier et s'arrêtera sur votre point d'arrêt :

<img src="https://forum.duniter.org/uploads/default/original/1X/0f0a3c10e6d927f6b30f7f7afc326ce6bcd5aa7f.png" width="620" height="499">

Observant cela avec attention. Notons entre autres :

* la ligne bleue dans la partie supérieure qui indique l'endroit du code où Node.js est actuellement en pause
* la fenêtre inférieure de WebStorm qui est la fenêtre de débogage
  * on y voit notamment une partie "Variables" indiquant les différentes valeurs des variables à portée comme :
    * `pr` dont la valeur est un objet `Peer`
    * `pr.version` dont la valeur est `"2"` : cela tombe bien, car nous avons mis un point d'arrête sur une ligne dont le but est de vérifier que pr.version est bien égal à `"2"` : ce test passera.

On peut donc ainsi comprendre tout ce qui se passe dans Duniter. Ici il s'agit d'un test automatisé, mais on peut faire exactement la même chose avec `bin/ucoind` comme nous allons le voir au prochain niveau !

## Niveau XI : point d'arrêt d'une commande

Continuons avec la commande `webwait`, et tentons d'y poser un point d'arrêt. Rendez-vous dans le fichier `bin/ucoind` à la ligne 830.

Ajoutons 2 points d'arrêt : 1 en ligne 830 et un autre en ligne 831 :

<img src="https://forum.duniter.org/uploads/default/original/1X/a039e658be64a3f575f5832d7e33b51e1f1501b7.png" width="466" height="128">

Maintenant, lançons la commande webwait en sélectionnant la configuration "commande webwait" puis en choisissant le bouton de débogage en forme d'insect (de *bug* en anglais) :

<img src="https://forum.duniter.org/uploads/default/original/1X/d3219eb54752acf0c91fa5f805f81d2cd12647cd.png" width="302" height="36">

Comme nous pouvons le voir, la magie opère à nouveau : le code s'arrête sur notre 1er point de débogage, ligne 830.

Si l'on observe l'onglet "Console" de la fenêtre de debug (= débogage), on peut y voir ceci :

<img src="https://forum.duniter.org/uploads/default/original/1X/ba9437cad15e33e6361f9a09f13b7de224e373f9.png" width="690" height="352">

Si l'on appuie maintenant sur la touche `F9`, voici le nouvel état :

<img src="https://forum.duniter.org/uploads/default/original/1X/13d5c59c0b7cab3e3da89e9c38f9e4df85f6fcbf.png" width="690" height="270">

Le programme s'est arrêté cette fois au second point d'arrêt, et on peut observer dans la console un nouveau message :

```text
2016-06-01T17:36:48+02:00 - debug: Plugging file system...
```

C'est donc que la fonction `webInit()` a *peut-être* été la cause de cet appel. Vérifions.

### Visualisation de la pile d'appel

Recherchons le chaîne de caractères `"Plugging file system..."` dans le code pour repérer un éventuel appel. Pour cela, utilisez le raccourci `Ctrl + Shift + F` :

<img src="https://forum.duniter.org/uploads/default/original/1X/b268b42ae72c654fab28e9078f6468d41105ea3f.png" width="421" height="500">

Pius cliquez sur "Find". Vous obtiendrez le résultat suivant :

<img src="https://forum.duniter.org/uploads/default/original/1X/48f80f1e07828edab1601f4414f605b995143ddd.png" width="471" height="227">

Double-cliquez sur le résultat trouvé, et vous serez alors amené au fichier `server.js`, ligne 72. Ajoutez-y un point d'arrêt :

<img src="https://forum.duniter.org/uploads/default/original/1X/789c7fbb457d3f780316a2cf164ed45f82d0c701.png" width="448" height="94">

Relancez alors directement le débogage complet de la commande en utilisant le raccourci `Ctrl + F5`. Vous retombez d'abord sur votre 1er point d'arrêt initial :

<img src="https://forum.duniter.org/uploads/default/original/1X/ba9437cad15e33e6361f9a09f13b7de224e373f9.png" width="690" height="352">

Si vous faites de nouveau F9, vous arriverez alors à cet écran :

<img src="https://forum.duniter.org/uploads/default/original/1X/a6771e01590846568f895871d0d9c9aa8a9666d7.png" width="620" height="499">

Cela signifie une 1ère chose, c'est que ce point d'arrête intervient manifestement *avant* le celui du fichier `ucoind` ligne 831.

Et si l'on regarde la pile d'appel (colonne "Frames" de la fenêtre de debug), on peut repérer que c'est la fonction en ligne 858 du fichier `ucoind` qui appelle ce code d'information "Plugging file system...".

<img src="https://forum.duniter.org/uploads/default/original/1X/5a5f72bbdc39f897fba4ad8a8383dca5e0d67a2f.png" width="620" height="499">

Et à quoi correspond cette ligne 858 ? Cliquons sur cette ligne dans le colonne "Frames" pour y être amené. Et où arrivons nous ? Dans la fonction `webInit()` !

<img src="https://forum.duniter.org/uploads/default/original/1X/e31c24b98d23ab1f4e6446cb39d28dbb94fedb50.png" width="690" height="260">

On peut donc en déduire que c'est **la fonction `webInit()` est responsable de l'appel du code** informant l'utilisateur que le logiciel est en train de "Brancher le système de fichiers...".

Quoi de transcendant à cela ? A priori rien. Mais cela signifie une chose très importante : **il n'est pas nécessaire de connaître l'architecture complète de l'application pour comprendre ce qu'elle fait.** Il suffit de placer les points d'arrêts aux endroits qui vous intéressent pour explorer la totalité des chemins d'appels, et donc de comprendre la responsabilité de chaque partie du code.

> A noter qu'il s'agit d'une technique simple et très efficace quand l'on souhaite comprendre un projet libre dont on ne connaît *a priori* rien. Votre serviteur s'en sert très régulièrement pour le développement de Duniter pour les dépendances qu'il utilise : celles-ci se composent de fichiers JavaScript, et sont par conséquent *également* débogables à l'exécution de Duniter.

## Niveau XII : déboguer un appel HTTP

Nous avons vu comment déboguer le code d'un test unitaire, puis celui d'une commande. Reste celui d'un appel HTTP.

Rappelez-vous, il s'agit des appels d'URL dans votre navigateur  web de la forme :

```text
http://<votre_interface>/node/summary
```

Essayons cette fois de déboguer un appel à l'URI `/wot/lookup/[recherche]`, qui permet de rechercher les informations disponibles pour une identité dont l'identifiant UID ou la clé publique contiendrait le valeur `[recherche]`.

### Lancer la commande `start` en mode debug

Ce débogage est en réalité très simple, puisqu'il consiste principalement à lancer l'application en mode debug, à placer le point d'arrêt à un endroit pertinent, *puis* à lancer la requête HTTP dans le navigateur.

Nous considérerons que vous savez désormais comment lancer l'application en mode debug, mais pour rappel succinct :

* ajouter une configuration Node.js
  * mettez comme fichier cible `bin/ucoind`
  * valorisez les arguments avec `start`

### Placer un point d'arrêt pour les appels HTTP

Petit point d'architecture. Il est en fait assez simple de trouver les points de réponse HTTP dans le code, à partir du fichier `app/lib/streams/bma.js`. Ouvrez-le et voyez le code suivant :

<img src="https://forum.duniter.org/uploads/default/original/1X/6441a732cca56a89b94ec760b7b721da7526fc1b.png" width="620" height="499">

On retrouve ici l'ensemble des méthodes web accessibles dans [le document technique décrivant l'API HTTP BMA](https://github.com/duniter/duniter/blob/master/doc/HTTP_API.md).

Comme nous nous intéressons à la méthode `/wot/lookup`, maintenez la touche `Ctrl` enfoncée tout en cliquant sur le mot `lookup` de `wot.lookup` :

<img src="https://forum.duniter.org/uploads/default/original/1X/1ef8c93170bada28820e2a9a003bf0d68881b136.png" width="97" height="22">

Vous serez alors automatiquement redirigé par l'EDI vers la méthode qui sera effectivement appelée durant l'appel HTTP. Mettons un point d'arrêt ligne 25 par exemple :

<img src="https://forum.duniter.org/uploads/default/original/1X/f1868bbbe60e791f2f50aaa1c3fd15e571a69a22.png" width="619" height="111">

### Lancer la recherche avec `/wot/lookup/abc`

Si vous accédez à l'URL :
```text
http://<votre_interface>/wot/lookup/abc
```

Alors vous obtiendrez l'arrêt de l'application au point d'arrêt ajouté, et vous devriez avoir la variable `search` valorisée à `abc`. Si vous appyez sur F9, votre navigateur affichera la réponse et le programme sera de nouveau en marche.

Réessayez avec une valeur autre que `abc` pour voir la valeur changer au niveau du point d'arrêt.

### Voir le nombre d'identités trouvées

Regardez la ligne 25 du fichier wot.js que nous débogons actuellement :

```js
var identities = yield IdentityService.searchIdentities(search);
```

On pourrait traduire cette ligne en "Mettre dans la variable `identities` le résultat de la recherche renvoyée par la fonction `searchIdentities` de l'objet `IdentityService` avec le paramètre `search` de notre recherche.

En plaçant un point d'arrêt ligne 26, on pourra alors observer le contenu de cette variable, notamment en ajoutant un "Watcher" :

<img src="https://forum.duniter.org/uploads/default/original/1X/8a578735e5d318b7294fbd8465ee9689e1e9fa84.png" width="690" height="286">

Voyez dans la partie "Watches" la saisie que nous venons de faire : il s'agit de JavaScript renvoyant la propriété `length` de l'objet `identities` (qui est un tableau). Si nous validons cette saisie, nous obtenons alors :

<img src="https://forum.duniter.org/uploads/default/original/1X/dd777c2d3d0d83ab3686a69299e003a149e44417.png" width="690" height="286">

### Déboguer l'API via un test unitaire

Lancez cette fois le fichier `test/integration/lookup.js` en mode debug. Ce test de 71 lignes contient un algorithme très simple qui fait notamment appel à la méthode `/wot/lookup`. Vous devriez de nouveau vous arrêter sur le point d'arrêt et voir l'appel qui est effectué par le test.

L'avantage de ce test est que vous n'avez pas à configurer votre nœud local pour qu'il fonctionne : le test *inclut* l'instanciation d'un nœud avec un port donné, et les données sont inscrites en mémoire le temps du test. De quoi relancer sereinement le test pour déboguer efficacement.

### Conclusion de ce niveau

Vous avez désormais parcouru les points les plus importants pour **voir** fonctionner techniquement l'application, jusque dans ses tests unitaires.

Dans le prochain et avant dernier niveau, nous vous proposerons de *coder* réellement l'application, et pour un code a publier officiellement dans le dépôt Duniter !

## Niveau XIII : résoudre un bug

Ce niveau est très simple : il faut résoudre le bug suivant : https://github.com/duniter/duniter/issues/387

J'ai déjà codé le test unitaire permettant de déceler effectivement le bug, dans le test du fichier `lookup.js` du niveau précédent.

Pour le moment le test ne renvoie pas d'alarme, car celui-ci est *désactivé* : pour réactiver le test, il faut supprimer le code `.skip` ligne 60 :

```js
it.skip('...'
```

doit devenir :

```js
it('...'
```

Si vous exécutez ce fichier, le test vous annoncera une erreur. Or pourtant, le test est correctement écrit : c'est bel et bien un bug de la méthode `/wot/lookup`. A vous de trouver quoi, et de réaliser le correctif.

Pour savoir si votre code est bon et corrige l'anomalie, relancez le test. S'il ne passe toujours pas, réétudiez le problème, changez votre correctif et relancez le test.

Répétez ce processus jusqu'à ce que le test passe.

Bonne chance !
