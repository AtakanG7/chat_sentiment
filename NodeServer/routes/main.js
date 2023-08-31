const express = require("express");
let router = express.Router();

router.get("/", async (req,res) => {

    try{
  
       res.render("main");
  
    }catch(err){
  
      console.log(err);
      res.status(500).send("error");
  
    }
  
});

module.exports = router;
