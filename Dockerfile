FROM node:9.5-alpine

RUN apk update && \
  apk upgrade && \
  apk add ca-certificates && update-ca-certificates

RUN apk add --update tzdata
ENV TZ=America/New_York

RUN rm -rf /var/cache/apk/*

WORKDIR /usr/src/
COPY package.json .
RUN npm install

COPY --chown=node:node . .

EXPOSE 3000

CMD ["npm", "start"]