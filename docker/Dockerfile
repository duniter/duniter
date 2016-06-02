FROM debian:jessie

RUN apt update
RUN apt -y install curl git build-essential python
RUN useradd --create-home -ms /bin/bash duser

USER duser
WORKDIR /home/duser

RUN curl -kL https://raw.githubusercontent.com/duniter/duniter/master/install.sh | bash

EXPOSE 8999

ADD go /home/duser/go

CMD ["bash", "-i", "/home/duser/go"]
