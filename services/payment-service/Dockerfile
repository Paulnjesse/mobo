FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY --chown=node:node . .

USER node

EXPOSE 3003

CMD ["node", "server.js"]
