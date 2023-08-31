const { Router } = require("express");
const express = require("express");
const cors = require('cors');
const session = require("express-session");
const cookieParser = require("cookie-parser");

const mainRouter = require("./routes/main");
const usersRouter = require(`./routes/users`);
const loginRouter = require("./routes/login");
const signupRouter = require("./routes/signup");
const aboutRouter = require("./routes/about");
const app = express();

app.use(cors());

app.use(cookieParser());

app.use(session({
    secret:"aaaaaa",
    resave:false,
    saveUninitialized: false
}));    

app.set("view engine","ejs");

app.use("/main",mainRouter);

app.use("/login", loginRouter);

app.use("/signup",signupRouter);

app.use("/about",aboutRouter);

app.use("/chatroom",usersRouter);

app.use(express.static("public"));


var port = 8080;

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
})

