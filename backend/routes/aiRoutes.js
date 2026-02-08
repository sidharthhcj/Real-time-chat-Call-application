import express from "express";
import OpenAI from "openai";
import jwt from "jsonwebtoken";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// auth middleware
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

// 🔹 SMART REPLY
router.post("/smart-reply", auth, async (req, res) => {
  const { lastMessage } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Give 3 short chat replies for: "${lastMessage}"`
        }
      ],
    });

    res.json({
      replies: completion.choices[0].message.content
        .split("\n")
        .filter(Boolean)
    });
  } catch (err) {
    res.status(500).json({ error: "AI failed" });
  }
});

// 🔹 CHAT SUMMARY
router.post("/summary", auth, async (req, res) => {
  const { messages } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Summarize this chat briefly:\n${messages.join("\n")}`
        }
      ],
    });

    res.json({
      summary: completion.choices[0].message.content
    });
  } catch {
    res.status(500).json({ error: "Summary failed" });
  }
});

export default router;
