const express = require("express");
const Connection = require("../data/db");
let router = express.Router();
const pool = require(`../data/db`);
const axios = require('axios');
const bodyParser = require('body-parser');
const API_ENDPOINT = 'https://api.summarify.io/token';
const API_ENDPOINT1 = 'https://api.summarify.io/sentiment-analysis';
const fs = require('fs');
const redis = require('redis');
const Websocket = require("ws");

const ws = new Websocket.Server({port:8070});

const clients = {};

const client = redis.createClient({
  host:"0.0.0.0",
  port:6379
});

client.connect().then( () => {
  console.log(`Welcome to the Redis`);
}).catch(err => {
  console.log(err);
})

// I will store the api key in a different file.
const config = JSON.parse(fs.readFileSync("config.json"));
let token = config.sumapi;

router.use(express.urlencoded({ extended: true }));
router.use(bodyParser.json());


ws.on("connection", async (socket,req) => {

  console.log("Someone has connected!");

  const url = new URL(req.url, "ws://localhost:8070"); // get parameters
  const params = url.searchParams;
  const mycookie = params.get("userid");  
  const id = mycookie.split("userId=")[1]; // get user id
  
  clients[mycookie] = socket; // give identity to each user
  
  await client.lPush("onlinepeople",mycookie); // set the id of online people.


  socket.on("close", async () => {
    
    delete clients[mycookie];
    console.log("client disconnected!");

    await pool.query("DELETE FROM online WHERE id = ?",[id]);

 
  });

})

async function scanForNewKeys() {

  

  try {

    // get all waiting messages to send them to sentiment analysis
    const result = await client.hGetAll('message_hash');

    // get all keys to delete later.
    const fieldnames = await client.hKeys("message_hash");

    if(fieldnames[0] != null){

      console.log(fieldnames);
      // delete them
      await client.hDel("message_hash", fieldnames);
          
    }else{
      return;
    }
   


    const keys = Object.keys(result);
    const values = Object.values(result);


    for (let i = 0; i < keys.length; i++) {

      let id = keys[i];
      let message = values[i];


      await getSentimentAnalysis(message, id)
      .then(res  => {
        let sentimentResult = res;
        let label = sentimentResult.data.evaluation["label"];
        let score = sentimentResult.data.evaluation["score"];

        return save_New_Messages(id, message, label, score);

      })
      .then(result => {
        console.log(`message with id ${id} saved!`);
      })
      .catch(err => {
        console.log("Error while sentiment analysis: ", err);
      });
    


      
    }
  } catch (err) {
    console.error(err);
  }
  
}

const OneInterval = setInterval(scanForNewKeys,500);

if(clients[0] === null){
   clearInterval(OneInterval);
}

//sends sentiment analysis request to sumapi.
async function getSentimentAnalysis(message) {

  const data = {
    body: message,
    domain: 'general',
  };
  const headers = {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await axios.post(API_ENDPOINT1, data, { headers });
    return response;
  } catch (error) {
    console.error(error);
  }
}

async function save_New_Messages(id,message,label,score){

  // required sql command
  let sql = "UPDATE message SET message = ?, label = ?,score = ? WHERE id = ?";

  // connection

  let values = [message,label,score,id];

  let end = (await pool).query(sql,values);


  console.log(`message with id ${id} updated!`);

  await client.lPush("updatedMessageID",id);
}

// this router will look for new messages in the sql database.
router.get("/getmessages", async function(req, res) {

  // set headers:
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "/"); 

  try {

    // this variable will enable next code to sneak all messages out from database.
    let lastMessageTimestamp = 0;


    // will look up to the message_sentiment table and will retrieve the new messages 
    // from the table each messages will be checked if their label value is null or not
    // if null tough it will send it to the sentiment analysis and save the coming message 
    // to the message_sentiment table a
    const sendNewMessages = async () => {


          // looks for the latest message.
          const [result] = await pool.query('SELECT * FROM message WHERE timestamp > ?', [lastMessageTimestamp]);


          // if there are messages...
          if (result.length > 0) {

                
                //update the timestamp
                lastMessageTimestamp = result[result.length - 1].timestamp;


                //this will let us basicly get new messages to the client. 
                //in this case we have to use "data: " like this this is a must.
                res.write("data: " + JSON.stringify(result) + "\n\n");
            
          }


    };

    //this will call the 
    const intervalId = setInterval(sendNewMessages, 500);


    // if the connection closes we have to stop the setInterval method 
    //otherwise it will still make operation on database eagerly :).
    req.on("close", () => {

          clearInterval(intervalId);

          res.end();

    });


  } catch (err) {

      console.error('Error fetching new messages:', err);
      
      res.status(500).send('Error fetching new messages.');
      
  }
});


router.post("/private-chat", async (req, res) => {
  const userId = req.body.userId;
  const anotherId = req.body.anotherId; // ids required to create table

  const tableExists0 = (await pool.query("SHOW TABLES LIKE ?", [`privateChat${userId + anotherId}`]))[0].length > 0; // check if there is a table
  const tableExists1 = (await pool.query("SHOW TABLES LIKE ?", [`privateChat${anotherId + userId}`]))[0].length > 0;

  try {

    if (!tableExists0 && !tableExists1) {

      // If there are no tables, create one
      let con = anotherId + userId;
      console.log(con);
      await pool.query(`
        CREATE TABLE \`privateChat${con}\` (
        id INT NOT NULL AUTO_INCREMENT,
        userId INT NOT NULL,
        message VARCHAR(200) NULL,
        timestamp VARCHAR(45) NULL,
        PRIMARY KEY (id))
      `); // Table is getting created...

      console.log("created!");
      let respond0 = { tableName: con }; // Create an object with the table name
      res.status(200).json(respond0); // Send JSON data as the response

    } else {
      
      let data;
      let tableName;
      if (tableExists0) {
        data = await pool.query(`SELECT * FROM privateChat${userId + anotherId}`);
        tableName = userId + anotherId;
      } else if (tableExists1) {
        data = await pool.query(`SELECT * FROM privateChat${anotherId + userId}`);
        tableName = anotherId + userId;
      }

      let respond1 = { tableName:tableName, message:data }; // Create an object with the table name
      res.status(200).json(respond1); // Send JSON data as the response

    }

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal Server Error" });
  } 
});

router.post("/private-message-stream", async (req,res) =>{

  const userId = req.body.userId;
  const tableId = req.body.tableId;
  const message = req.body.message;
  const timestamp = req.body.timestamp;

  try{

    await pool.query(`INSERT INTO privateChat${tableId} (userId,message,timestamp) VALUES (?,?,?)`,[userId,message,timestamp]);
    console.log("private chat data saved!");
  }catch(err){

    console.log("while saving private chat data" + err);

  } finally {


    res.status(200).send("Ok!");
  }
});

router.get("/get-new-messages", async (req,res) => {
  
  try{

    const url = new URL(req.url, "http://localhost:8080/get-new-messages"); // get parameters
    const params = url.searchParams;
  
    const userId = params.get("userId"); 
    const anotherId = params.get("anotherId");
    const chatId = params.get("chatId");
    const lastMessageTimestamp = params.get("timestamp");
  
    const [result] = await pool.query(`SELECT * FROM privateChat${chatId} WHERE timestamp>?`,[lastMessageTimestamp]); // private chat messages
    
    let formatResult = JSON.stringify(result);
  
    res.send(result);
  
  } catch(err){

    console.log(err);

  } 

  res.end();
});

setInterval(async () => { // check for new messages in the Redis queue every 1 seconds

  try {
    
    const index = await client.lRange('updatedMessageID', 0, -1); // fetch the message IDs from the Redis queue

    for (let i = 0; i < index.length; i++) { // loop through the message IDs

      const id = index[i];

      const [result] = await pool.query('SELECT id, message, label, score FROM message WHERE id = ?', [id]); // look for the updated message in the SQL database

      if (result.length > 0) {  // if there are new messages, send them to all connected clients

        const message = JSON.stringify(result);

        let myclients = Object.values(clients);
        let myClients = Object.keys(clients);

        if(myclients != null){ // send updated messages

          myclients.forEach((client) => {
  
            client.send(message);

          });

        }

      }

      // remove the message ID from the Redis queue
      await client.lRem('updatedMessageID', 1, id);

    }

  } catch (err) {
    console.error('Error fetching new messages:', err);
  }

}, 700);


setInterval( async () => { // save online people

  let list = await client.lRange("onlinepeople",0,-1);
   
  for(let i = 0; i<list.length;i++){

    const info = await pool.query("SELECT * FROM users WHERE id = ?",[list[i].split("userId=")[1]]);
    let {id,username} = info[0][0];
    const userinfo = await pool.query("INSERT INTO online (id, username) VALUES (?, ?)",[id,username]);
    
    await client.lRem("onlinepeople",1,list[i]);

  }
  
}, 1000);

setInterval( async () => { // send online people.
  try{
    
    const data = await pool.query("SELECT * FROM online");

    const listOfClients = Object.values(clients);
    let format = JSON.stringify(data[0]);
    listOfClients.forEach(client => {
      client.send(format);
    });
  }catch(err){
    console.log(err)
  }

   
},1000);

// this router will look for new messages in the sql database.
router.get("/update_messages", async function(req, res) {

  // set headers:
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "/"); 

  try {

    // this variable will enable next code to sneak all messages out from database.
    let lastMessageTimestamp = 0;


    // function to look up to the database and if there is a new message send it to
    // the client. Thats it :D
    const sendNewMessages = async () => {


          // looks for the latest message.
          const [result] = await pool.query('SELECT * FROM message WHERE timestamp > ?', [lastMessageTimestamp]);


          // if there are messages...
          if (result.length > 0) {


                for(let i = 0; i<result.length;i++){

                  

                    let id = result[i].id;
                    let message = result[i].message;
                    let label = result[i].label;

                    if(label==null || label==""){

                        client.hSet("message_hash", id, message ,(error,response) => {
                          if (error) {
                            console.error(`Error setting message in Redis: ${error}`);
                          } else {
                            console.log(`Message with ID ${id} set in Redis`);
                        }});

                    }else{

                        //this will let us basicly get new messages to the client. 
                        //in this case we have to use "data: " like this this is a must.
                        res.write("data: " + JSON.stringify(result) + "\n\n");

                    }

                }

                 //update the timestamp
                 lastMessageTimestamp = result[result.length - 1].timestamp;
          }


    };
    
    //this will call the 
    const intervalId = setInterval(sendNewMessages, 1500);


    // if the connection closes we have to stop the setInterval method 
    //otherwise it will still make operation on database eagerly :).
    req.on("close", () => {

          clearInterval(intervalId);

          res.end();

    });


  } catch (err) {

      console.error('Error fetching new messages:', err);
      
      res.status(500).send('Error fetching new messages.');
      
  }
});

setInterval(() => {
  refreshSumApiToken()
},1000*60*60*4)

// will refresh the expired tokens by sumapi. :)
async function refreshSumApiToken(){


   axios.post(API_ENDPOINT, {


          grant_type: 'password',
          username: 'test',
          password: '5Br5Yhdu4fS87C',


  }, {

    // you need to add a header if would like to have a token !
    headers: {

          'Content-Type': 'application/x-www-form-urlencoded',

    },
  
  }).then(response =>{


          newToken = response.data.access_token;

          console.log("refreshed token : " + newToken);

          config.sumapi = newToken;

          fs.writeFileSync("config.json", JSON.stringify(config));


  }).catch(err => {

          console.log("While Refreshing The Token : " + err);

  });
}

router.post("/private-chat/message-sentiment-analysis", async (req,res) => {
  
  try{

    let id = req.body.id;
    let message = req.body.message;
  
    let result =  await getSentimentAnalysis(message);
  
     res.send(result.data);
     
  }catch(err){
    console.log("error, while private chat sentiment analysis" + err)
  }

});

router.post("/message", async function(req, res) {

    console.log(req.body);

    let timestamp = req.body.timestamp;

    // this buddy looks for empty messages if so redirects the request to the main url.
    if(req.body.messaga.trim() === ""){

        console.log("Provide non-empy string!");
        

    }else if("id" in req.body){

      let id = req.body.id;
      let message = req.body.messaga;

      client.hSet("message_hash", id, message ,(error,response) => {
        if (error) {
          console.error(`Error setting message in Redis: ${error}`);
        } else {
          console.log(`Message with ID ${id} set in Redis`);
      }});

    }else{
      try { 


              let message = req.body.messaga;
              console.log(message);
 
         
              const queryMessage = "INSERT INTO message (message,timestamp) VALUES (?,?)";

              const values = [message,timestamp];

              const result = await pool.query(queryMessage, values);


              console.log('Data inserted successfully');
              
              res.status(200).send("ok");
          
             

      } catch (err) {


        console.log(err);
        res.status(500).send('Error inserting data into database.');
        
        
      }

    }

});


// the chatroom 
router.get('/', async (req, res) => {

  try {

    let sessionID = req.sessionID;
    let UserID = req.cookies.userId;


    if(UserID){
      
      const [session] = await pool.query("SELECT session FROM users WHERE id=?",[UserID]);    
      
      if(session == undefined){
        res.render("aut");
        res.end();
      }
        

      if(sessionID === session[0].session){
        res.render('chatroom');
      }else{
        res.render("aut");
        res.end();
      }
      
    }else{
      
      res.render("aut");
      res.end();

    }

  } catch (err) {

    console.error('Error in database connection:', err);
    res.status(500).send('Error connecting to the database!');

  }
});



module.exports = router;
