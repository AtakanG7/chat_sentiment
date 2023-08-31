const express = require("express");
const router = express.Router();
const pool = require("../data/db");
const bodyParser = require('body-parser');


router.use(express.urlencoded({ extended: true }));
router.use(bodyParser.json());

router.post("/log", async (req, res) => {


    console.log(req.body);
    let {username, password, timestamp} = req.body;
  
  
    try {
  
      const [rows] = await pool.query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ? AND password = ?) AS `exists`",[username, password]);
  
      const userExists = rows[0].exists === 1;
  
      console.log(rows[0].exists);
  
      if (userExists) {
  
        let userId;
  
        let resl = await pool.query("SELECT id FROM users WHERE username = ? AND password = ?", [username,password]);
        
        userId = resl[0][0].id;
  
        let session = req.sessionID;
  
        await pool.query("UPDATE users SET session = ? WHERE username = ? AND password = ?", [session, username, password]);
  
  
        req.session.isAuth = true;
  
        const expirationTime = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
        res.cookie("userId", userId, { expires: expirationTime });
        console.log(session);
  
        console.log(`User ${username} logged in!`);
        res.send("Ok!");
  
      } else {
        res.send("not Ok!");
      }
  
  
    } catch (err) {
  
      console.log(err);
      res.status(500).send("Internal Server Error");
  
    } 
  

});
  
router.get("/", async (req, res) => {
  
    
    try {
      res.render("login");
    } catch (err) {
      console.log(err);
      res.status(500).send("error");
    }

  
});


module.exports = router;