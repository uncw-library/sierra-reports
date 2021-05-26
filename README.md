### What the app does

  This app does various queries on Sierra db.

  It is intended mainly for Jason, Elisabeth, & other librarians.

### How to build a prod image

  - After you get the code like you want it,

  ```
  docker login libapps-admin.uncw.edu:8000
  docker build --no-cache -t libapps-admin.uncw.edu:8000/randall-dev/sierra-reports .
  docker push libapps-admin.uncw.edu:8000/randall-dev/sierra-reports
  ```

### How to build a dev box

#### Docker-compose approach

  Create a file at sierra-reports/.env with contents:  (find the ldap user/pass in Rancher or where we save passwords.  Use your personal sierra user/pass.)

  ```
  LDAP_USER=ActualLdapUser
  LDAP_PASS=ActualLdapPass
  SIERRA_USER=ActualSierraUser
  SIERRA_PASS=ActualSierraPass
  NODE_ENV=development
  ```

then,

  ```
  cd sierra-reports
  docker-compose up -d
  ```

  Connect to uncw VPN & see the app at localhost:3000

  - `docker-compose down`  # to stop it

To add a new package, run `npm install {{whatever}}` on your local computer to add that requirement to package.json.  Running `docker-compose down` `docker-compose up --build --force-recreate -d` will rebuild the image & container with the new package.json requirement.

To revise the app, revised the code in the ./app folder.  Nodemon inside the container will auto-reload the app whenever you revise ./app.  This works because the ./app folder on your local computer is volume mounted inside the container.  Any revisions to ./app is reflected inside container.

Push any code changes to gitlab.
