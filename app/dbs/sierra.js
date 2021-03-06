const pg = require('pg')
const { Pool } = require('pg')

// Connect to Sierra postgres database using a client
const client = new pg.Client({
  user: process.env.SIERRA_USER,
  password: process.env.SIERRA_PASS,
  database: process.env.SIERRA_DB,
  port: process.env.SIERRA_PORT,
  host: process.env.SIERRA_URL,
  ssl: {
    rejectUnauthorized: false
  },
  application_name: 'sierra-reports'
})

client.connect()

// Connect to Sierra using a pool
const pool = new Pool({
  user: process.env.SIERRA_USER,
  password: process.env.SIERRA_PASS,
  database: process.env.SIERRA_DB,
  port: process.env.SIERRA_PORT,
  host: process.env.SIERRA_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 36000,
  application_name: 'sierra-reports'
})

module.exports = {
  client,
  query: (text, params, next) => {
    return pool.query(text, params, next)
  }
}
