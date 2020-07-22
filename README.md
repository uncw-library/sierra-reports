### What the app does

  This app does various queries on Sierra db.

  It is intended mainly for Jason, Elisabeth, & other librarians.

### How to build a dev box

#### Docker-compose approach

  Create a file at sierra-reports/.env with contents:  (find the actual user/passes in Rancher or where we save passwords)

  ```
  LDAP_USER=ActualLdapUser
  LDAP_PASS=ActualLdapPass
  SIERRA_USER=ActualSierraUser
  SIERRA_PASS=ActualSierraPass
  NODE_ENV=production
  ```

then,

  ```
  cd barcode-lookup
  docker-compose up -d
  ```

  Connect to uncw VPN & see the app at localhost:3000

  - `docker-compose down`  # to stop it

To add a new package, run `npm install {{whatever}}` on your local computer to add that requirement to package.json.  Running `docker-compose down` `docker-compose up --build --force-recreate -d` will rebuild the image & container with the new package.json requirement.

To revise the app, revised the code in the ./app folder.  Nodemon inside the container will auto-reload the app whenever you revise ./app.  This works because the ./app folder on your local computer is volume mounted inside the container.  Any revisions to ./app is reflected inside container.

Test your changes, with `docker exec barcode-lookup npm run test` or `npm run test`

Push any code changes to gitlab.

#### Bare metal approach

  I recommend the docker approach, because node keeps adding/removing features.  I.e., this app was originally built for node9, and it no longer ran on the current node12.  Who knows what version of node will be on your computer when you run this.  But if you must...

  set the env variables to match those described above.

  ```
  cd sierra-reports
  npm install
  npm start
  ```

  See the app at localhost:3000

To add a new package, run `npm install {{whatever}}`.  This adds the library to your local repo's package.json and to the local repo's ./node_modules folder.  With nodemon installed globally, run `nodemon ./app/bin/www`.  The view will be at localhost:3000.  When you revise the code, nodemon with reload the app with your new changes.

Test your changes with `npm run test`.

Push any changes to gitlab.


### How to build a prod image

  - After you get the code like you want it,

  ```
  docker login libapps-admin.uncw.edu:8000
  docker build -t libapps-admin.uncw.edu:8000/randall-dev/sierra-reports:{your_version} .
  docker push libapps-admin.uncw.edu:8000/randall-dev/sierra-reports:{your_version}
  ```
