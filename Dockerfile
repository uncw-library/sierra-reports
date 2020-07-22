FROM node:12-alpine

RUN apk update && \
  apk upgrade && \
  apk add ca-certificates && update-ca-certificates && \
  apk add tzdata g++ gcc libgcc libstdc++ linux-headers make python && \
  npm install --quiet node-gyp -g

ENV TZ=America/New_York

RUN rm -rf /var/cache/apk/*

WORKDIR /usr/src/
COPY package.json .
RUN npm install

COPY --chown=node:node app/ ./app
WORKDIR /usr/src/app/

EXPOSE 3000

CMD npm start