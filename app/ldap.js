ldap = {
  server: {
    url: `${process.env.LDAP_URL}:${process.env.LDAP_PORT}`,
    bindDN: process.env.LDAP_USER,
    bindCredentials: process.env.LDAP_PASS,
    searchBase: 'dc=uncw,dc=edu',
    searchFilter: '(&(sAMAccountName={{username}})(memberOf=CN=Library,OU=LIB,OU=AA,OU=Faculty-Staff,DC=uncw,DC=edu))'
  }
}


module.exports = ldap
