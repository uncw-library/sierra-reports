const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const createError = require('http-errors')
const favicon = require('serve-favicon')
const helmet = require('helmet')
const LdapStrategy = require('passport-ldapauth').Strategy
const logger = require('morgan')
const passport = require('passport')
const path = require('path')
const session = require('cookie-session')

const router = require('./routes')
const opts = require('./ldap')
require('./handlebars')

const app = express()

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'hbs')
app.use(favicon(path.join(__dirname, 'public', 'images', 'seahawk.ico')))
app.use(helmet())
app.use(cookieParser())
app.use(session({
  keys: ['cookie-session-sierra', 'dockerisawesome-sierra', 'webwizards-sierra'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}))
app.use(logger('dev'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, 'public')))

passport.use(new LdapStrategy(opts))
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser(function (user, done) {
  done(null, user.dn)
})
passport.deserializeUser(function (user, done) {
  done(null, user)
})

app.use('/', router)

/*
 if the request doesn't match a route above,
 create a 404 error
*/

app.use((req, res, next) => {
  next(createError(404))
})

/*
error handler
*/

app.use((err, req, res, next) => {
  res.status(err.status || 500)
  console.error(err.stack)
  res.locals.message = err.message
  // send error details to view only in development
  res.locals.error = app.get('env') === 'development' ? err : {}
  res.render('error')
})


module.exports = app
