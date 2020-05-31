# Prerequisites to generate an arm version of Duniter

Title: Generate an ARM release of Duniter
Order: 9
Date: 2018-01-26
Slug: create_arm_release
Authors: jytou

To produce an arm release file, there is currently the following requirement:

- a raspberry pi (preferably 3),
- raspbian jessie is the safest, if you produce the .deb file on more recent versions, it won't be installable on older ones, so avoid that!
- git (apt-get install git)
- zip (don't laugh, it is not included by default in raspbian) : sudo apt-get install zip
- nvm
- do not run anything else on that pi during the build, as it almost takes the 1 Gb and you may just run out of memory if you have other things running.

## Installing nvm

    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash

## Installing node

You need to install node with the exact version that is currently used. You can find the exact version for arm arch by running:

    ```
    grep "VERSION=" release/arch/arm/build*
    ```

Install expected node version:

    nvm install x.y.z

## Checking out and building Duniter

Check out the project and build it with the correct branch number:

    ```
    git clone https://git.duniter.org/nodes/typescript/duniter.git -b release/1.8
    cd duniter/
    release/scripts/build.sh make arm <version_number>
    ```

## Upload

Once the release is done, the .deb file is in release/arch/arm.

Go to [https://git.duniter.org/nodes/typescript/duniter/-/releases/](https://git.duniter.org/nodes/typescript/duniter/-/releases/)

Edit the release notes page of the wanted version and upload the .deb file there, try to respect the format of existing packages on the page.

Congrats, you're done!
