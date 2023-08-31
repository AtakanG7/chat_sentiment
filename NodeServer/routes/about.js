const express = require("express");
const router = express.Router();

router.get("/", async (req,res) => {

    try{
  
       res.render("about");
  
    }catch(err){
  
      console.log(err);
      res.status(500).send("error");
  
    }
  
});

module.exports = router;