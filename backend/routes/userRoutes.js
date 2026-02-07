import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

const router = express.Router();

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.userId = decoded.id;
  next();
};

router.get("/", auth, async (req, res) => {
  console.log("USER API HIT, logged user:", req.userId);

  const users = await User.find(
    { _id: { $ne: req.userId } },
    "username email"
  );

  console.log("USERS FOUND:", users);
  res.json(users);
});


export default router;
