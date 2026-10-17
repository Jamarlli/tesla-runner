FROM node:22-alpine
WORKDIR /app
COPY package.json server.js index.html ./
ENV PORT=3000 DATA_DIR=/data
# Monta aquí un volumen persistente: es donde vive scores.json (el leaderboard)
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.js"]
