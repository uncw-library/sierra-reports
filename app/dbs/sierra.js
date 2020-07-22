const pg = require('pg')
const { Pool } = require('pg')

// Connect to Sierra postgres database using a client
const client = new pg.Client({
  user: process.env.SIERRA_USER,
  password: process.env.SIERRA_PASS,
  database: 'iii',
  port: 1032,
  host: 'sierra-db.uncw.edu',
  ssl: {
    rejectUnauthorized: false
  },

})

client.connect()

const pool = new Pool({
  user: process.env.SIERRA_USER,
  password: process.env.SIERRA_PASS,
  database: 'iii',
  port: 1032,
  host: 'sierra-db.uncw.edu',
  ssl: {
    rejectUnauthorized: false
  },
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 36000
})


module.exports = {
  client,
  query: (text, params, next) => {
    return pool.query(text, params, next)
  }
}