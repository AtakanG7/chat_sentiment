const express = require("express");
const router = express.Router();
const pool = require("../data/db");
const bodyParser = require('body-parser');


router.use(express.urlencoded({ extended: true }));
router.use(bodyParser.json());

router.get("/", async (req,res) => {

    console.log(req.sessionID);
  
    try{
  
       res.render("../views/signup.ejs");
  
    }catch(err){
  
      console.log(err);
      res.status(500).send("error");
  
    }
  
  });

  router.post("/process", async (req,res) => {

    console.log(req.body);
  
    let {username, password, timestamp} = req.body;
  
    try{
  
      
      let boolean = await pool.query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?) AS boolean",[username]);
      let variable = boolean[0][0].boolean == 1;
  
  
      if(!variable){
        let sql = "INSERT INTO users (username, password, timestamp) VALUES (?, ?, ?)";
        await pool.query(sql,[username,password,timestamp]);
        console.log("A New User Signed Up!");
  
  
        res.send("Ok!");
      }else{
        res.send("not Ok!");
        
      }
     
      
  
    }catch(err){
      console.log(err);
      res.end();
    }
  
  
  });

  module.exports = router;