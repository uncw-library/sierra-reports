// git test
const express = require('express')
const path = require('path')
const favicon = require('serve-favicon')
const logger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const session = require('cookie-session')
const Handlebars = require('hbs')
const moment = require('moment')
const helmet = require('helmet')

const sierraReports = require('./routes/sierra-reports')

const app = express()

// LDAP Auth Options
const opts = require('./ldap')

// Use Passport for auth
const passport = require('passport')

// LDAP Strategy
const LdapStrategy = require('passport-ldapauth').Strategy

// Use Helmet for general application security
app.use(helmet())

// CookieParser
app.use(cookieParser())

// Use Cookie-Session
app.use(session({
  keys: ['cookie-session-sierra', 'dockerisawesome-sierra', 'webwizards-sierra'],

  // Cookie Options
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}))

// Configure passport to use LDAP for auth
passport.use(new LdapStrategy(opts))

app.use(passport.initialize())
app.use(passport.session())

passport.serializeUser(function (user, done) {
  done(null, user.dn)
})

passport.deserializeUser(function (user, done) {
  done(null, user)
})

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'hbs')

app.use(favicon(path.join(__dirname, 'public', 'images', 'seahawk.ico')))
app.use(logger('dev'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

app.use('/', express.static(path.join(__dirname, 'public')))
app.use('/bow', express.static(path.join(__dirname, 'bower_components')))

app.use('/', sierraReports)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  const err = new Error('Not Found')
  err.status = 404
  next(err)
})

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

// Register HBS helpers
Handlebars.registerHelper('isSelectedYear', function (selectedYear, iterYear) {
  return (selectedYear === iterYear)
})

Handlebars.registerHelper('previousYear', function (year) {
  return (year - 1)
})

Handlebars.registerHelper('formatMoney', function (decimalVal) {
  return parseFloat(decimalVal).toFixed(2)
})

Handlebars.registerHelper('formatDate', function (date) {
  const newDate = (moment(date).format('YYYY-MM-DD')).toString()
  return (newDate !== 'Invalid date') ? newDate : 'No date'
})
Handlebars.registerHelper('formatDatePrev', function (date) {
  return (moment(date).subtract(1, 'days').format('YYYY-MM-DD'))
})
Handlebars.registerHelper('formatDateNext', function (date) {
  return (moment(date).add(1, 'days').format('YYYY-MM-DD'))
})

Handlebars.registerHelper('formatDateSortable', function (date) {
  return (moment(date).format('YYYY-MM-DD'))
})

Handlebars.registerHelper('isSelected', function (iType, value1, value2) {
  if (iType) {
    return (iType === value2) ? 'selected' : ''
  } else {
    return (value1 === value2) ? 'selected' : ''
  }
})

Handlebars.registerHelper('ifItype', function (iType, bibRecord) {
  return (iType) || (bibRecord)
})

Handlebars.registerHelper('isChecked', function (checked) {
  return (checked === 'true') ? 'checked' : ''
})

Handlebars.registerHelper('formatNumber', function (num) {
  return (num) ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
})

// Returns either 'physical' or 'electronic'
Handlebars.registerHelper('extract', function (type) {
  return type.split(' ')[0].toLowerCase()
})

module.exports = app
