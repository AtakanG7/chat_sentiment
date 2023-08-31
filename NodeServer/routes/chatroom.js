const express = require("express");
const router = express.Router();
const pool = require("../data/db");
const bodyParser = require('body-parser');


router.use(express.urlencoded({ extended: true }));
router.use(bodyParser.json());
