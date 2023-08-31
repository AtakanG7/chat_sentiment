const mysql = require("mysql2");
let configuration = require("./config");


let connection = mysql.createConnection(configuration);



connection.promise().connect()
  .then(() => {
    console.log("Database Connection Successfully Established!");
  })
  .catch((err) => {
    console.error("There has been an error in database connection!", err);
  });


  // create a pool connection.
const pool = mysql.createPool({
  host:'mysql',
  user:'root',
  password: 'password',
  database: 'message',
  port: "3306",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 10
});

module.exports = pool.promise();
