import express from "express";
import Message from "../models/Message.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// simple auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.sendStatus(403);
  }
};

// Get messages for a specific room
router.get("/:roomId", auth, async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId })
      .populate("sender", "username")
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Save a message
router.post("/", auth, async (req, res) => {
  try {
    const { receiver, content, roomId } = req.body;
    const message = await Message.create({
      sender: req.userId,
      receiver,
      content,
      roomId,
    });
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
