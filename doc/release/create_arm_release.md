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
- do not run anything else on that pi during the build, as it almost takes the 1 Gb and you may just run out of memory if you have other things running.

## Installing yarn

Install yarn:

    ```
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
    sudo apt-get update && sudo apt-get install yarn
    ```

## Installing Node

You need to install node with the exact version that is currently used. You can find the exact version for all archs by running:

    ```
    grep "VERSION=" release/arch/*/build*
    ```

Download the file from https://github.com/jytou/NodeJs-Raspberry-Pi and run it (use sudo), for instance if the version of node is 8.9.1 (the current one):

    ```
    sudo ./Install-Node.sh 8.9.1
    ```

## Checking out and building Duniter

Check out the project and build it with the correct branch number:

    ```
    git clone https://git.duniter.org/nodes/typescript/duniter.git -b 1.7
    cd duniter/
    release/scripts/build.sh make arm <version_number>
    ```

## Upload

Once the release is done, the .deb file is in release/arch/arm.

Go to [https://git.duniter.org/nodes/typescript/duniter/tags/](https://git.duniter.org/nodes/typescript/duniter/tags/)

Edit the release notes page of the wanted tag and upload the .deb file there, try to respect the format of existing packages on the page.

Congrats, you're done!
