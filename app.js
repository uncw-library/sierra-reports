var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('cookie-session')
var Handlebars = require('hbs');
var moment = require('moment');
var helmet = require('helmet');

var index = require('./routes/index');
var sierraReports = require('./routes/sierra-reports');

var app = express();

//DBs
var sierra = require('./dbs/sierra');

//LDAP Auth Options
var opts = require('./ldap');

//Use Passport for auth
var passport = require('passport');

//LDAP Strategy
var LdapStrategy = require('passport-ldapauth').Strategy;

//Use Helmet for general application security
app.use(helmet());

//CookieParser
app.use(cookieParser());

//Use Cookie-Session
app.use(session({
  keys: ['cookie-session-sierra', 'dockerisawesome-sierra', 'webwizards-sierra'],
  
  // Cookie Options
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

//Configure passport to use LDAP for auth
passport.use(new LdapStrategy(opts));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user.dn);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/bow', express.static(path.join(__dirname, 'bower_components')));

app.use('/', sierraReports);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

//Register HBS helpers
Handlebars.registerHelper('isSelectedYear', function(selectedYear, iterYear){
  return (selectedYear == iterYear);
});

Handlebars.registerHelper('previousYear', function(year){
  return (year - 1);
});

Handlebars.registerHelper('formatMoney', function(decimalVal){
  return parseFloat(decimalVal).toFixed(2);
});

Handlebars.registerHelper('formatDate', function(date){
  return (String(date).length == 8) ? (moment(date).format("YYYY-MM-DD")) : "No Date";
});
Handlebars.registerHelper('formatDatePrev', function(date){
  return (moment(date).subtract(1, 'days').format("YYYY-MM-DD"));
});
Handlebars.registerHelper('formatDateNext', function(date){
  return (moment(date).add(1, 'days').format("YYYY-MM-DD"));
});

Handlebars.registerHelper('formatDateSortable', function(date){
  return (moment(date).format("YYYY-MM-DD"));
});

Handlebars.registerHelper('isSelected', function(iType, value1, value2){
  if (iType) {
    return (iType == value2) ? "selected" : ""
  } else {
    return (value1 == value2) ? "selected" : "";
  }
});


Handlebars.registerHelper('ifItype', function(iType, bib_record){
  return (iType) ? (iType) : (bib_record)
});


Handlebars.registerHelper('isChecked', function(checked){
  return (checked == 'true') ? "checked" : ""
});

Handlebars.registerHelper('formatNumber', function(num){
  return (num) ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "";
});

//Returns either 'physical' or 'electronic'
Handlebars.registerHelper('extract', function(type){
  return type.split(' ')[0].toLowerCase();
});

module.exports = app;
