//Replace the values below with the correct information and rename this file to db.js

var pg = require('pg');

//Connect to Sierra database using PostGres
var client = new pg.Client({
    user: process.env.SIERRA_USER,
    password: process.env.SIERRA_PASS,
    database: 'iii',
    port: 1032,
    host: 'sierra-db.uncw.edu',
    ssl: true,
});

client.connect();

console.log('Connected to Sierra DB');

module.exports = client;