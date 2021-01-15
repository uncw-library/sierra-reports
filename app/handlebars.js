const handlebars = require('hbs')
const moment = require('moment')

handlebars.registerHelper('isSelectedYear', function (selectedYear, iterYear) {
  return (selectedYear === iterYear)
})

handlebars.registerHelper('previousYear', function (year) {
  return (year - 1)
})

handlebars.registerHelper('formatMoney', function (decimalVal) {
  return parseFloat(decimalVal).toFixed(2)
})

handlebars.registerHelper('formatDate', function (date) {
  const newDate = (moment(date).format('YYYY-MM-DD')).toString()
  return (newDate !== 'Invalid date') ? newDate : 'No date'
})
handlebars.registerHelper('formatDatePrev', function (date) {
  return (moment(date).subtract(1, 'days').format('YYYY-MM-DD'))
})
handlebars.registerHelper('formatDateNext', function (date) {
  return (moment(date).add(1, 'days').format('YYYY-MM-DD'))
})

handlebars.registerHelper('formatDateSortable', function (date) {
  return (moment(date).format('YYYY-MM-DD'))
})

handlebars.registerHelper('isSelected', function (iType, value1, value2) {
  if (iType) {
    return (iType === value2) ? 'selected' : ''
  } else {
    return (value1 === value2) ? 'selected' : ''
  }
})

handlebars.registerHelper('ifItype', function (iType, bibRecord) {
  return (iType) || (bibRecord)
})

handlebars.registerHelper('isChecked', function (checked) {
  return (checked === 'true') ? 'checked' : ''
})

handlebars.registerHelper('formatNumber', function (num) {
  return (num) ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
})

// Returns either 'physical' or 'electronic'
handlebars.registerHelper('extract', function (type) {
  return type.split(' ')[0].toLowerCase()
})

module.exports.handlebars = handlebars
