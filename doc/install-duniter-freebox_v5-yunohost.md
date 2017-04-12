Installer Duniter sur Raspberry Pi 3 derrière une Freebox v5 avec Yunohost
===================


Ce tutoriel présente une manière de procéder pour installer Duniter sur un Raspberry Pi 3 (RPi) derrière une Freebox v5 avec Yunohost (v2.5.6).

Il s'appuie et s'inspire de deux autres tutoriels qu'il est vivement conseillé de lire au préalable :

 - [Duniter sur un VPN](https://forum.duniter.org/t/duniter-sur-un-vpn/2280/13)
 - [Duniter sur Yunohost derrière une box privatrice (type livebox)](https://forum.duniter.org/t/duniter-sur-yunohost-derriere-une-box-privatrice-type-livebox/2169)

Les principales étapes sont les suivantes :
 1. Paramétrer la Freebox
 2. Installer Yunohost
 3. Configurer la zone DNS du/des (sous)nom(s) de domaine
 4. Générer un certificat

----------

Paramétrer la Freebox
-------------

La fonction routeur de la Freebox v5 est accessible depuis l'interface web de Free :
![Freebox v5 routeur](./images/freebox_v5_routeur.png)

**Ouvrir les ports de la Freebox**

 Il s'agit d'ouvrir les ports suivants :
![Freebox v5 ports ouverts](./images/freebox_v5_redirections_ports.PNG)


**Fixer l'adresse ip du Raspberry**

Cette étape consiste à affecter une adresse ip fixe au RPi. 
Comme le mien était neuf, j'ai branché dessus un écran, un clavier et une souris pour installer le système d'exploitation [Raspbian Jessie Lite](https://www.raspberrypi.org/downloads/raspbian/) grâce à [NOOBS](https://www.raspberrypi.org/downloads/noobs/).
Une fois le système d'exploitation installé, j'ai lancé la commande suivante dans un terminal pour déterminer les adresses ip et mac du RPi : 
> ifconfig

Dans l'interface web de la Freebox, il faut ensuite se rendre dans la rubrique "Baux DHCP permanents" et ajouter les informations relatives au RPi.
![Freebox v5 - Baux DHCP permanents](./images/freebox_v5_baux_dhcp_perm.PNG)


----------


Installer Yunohost
-------------------
Yunohost est un système d'exploitation orienté serveur. Il permet de faire de l'auto-hébergement de services Internet. Il est basé et reste totalement compatible avec Debian GNU/Linux.

Après le paramétrage de la Freebox, j'ai :
 1. éteint le RPi ;
 2. retiré la carte micro-SD pour la formater ;
 3. copié une image de Yunohost dessus depuis un autre ordinateur ;
 4. introduit de nouveau la carte micro-SD dans le RPi pour installer Yunohost, en suivant [ces explications](https://yunohost.org/#/install_on_raspberry_fr)

Cette façon de procéder n'était peut-être pas la plus optimale. 


Configurer la zone DNS du/des (sous)nom(s) de domaine
-------------------



Générer un certificat
-------------------

