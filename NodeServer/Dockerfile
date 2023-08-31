FROM node:14

WORKDIR /node_app

COPY "./package*.json" .

COPY . .

RUN apt-get update && apt-get install -y npm

RUN npm init -y

RUN npm install 

RUN mkdir /var/lib/node_data

CMD ["node","server.js"] 


