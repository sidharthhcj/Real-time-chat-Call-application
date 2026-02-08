import express from "express";
import OpenAI from "openai";
import jwt from "jsonwebtoken";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔐 AUTH
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.sendStatus(403);
  }
};

/* ================= SMART REPLY ================= */
router.post("/smart-reply", auth, async (req, res) => {
  const { lastMessage } = req.body;
  if (!lastMessage) return res.json({ replies: [] });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",   // ✅ NEW MODEL
      messages: [
        {
          role: "system",
          content: "You are a chat assistant. Reply short and friendly."
        },
        {
          role: "user",
          content: `Give exactly 3 short chat replies for: "${lastMessage}"`
        }
      ],
      temperature: 0.7,
    });

    const text = completion.choices[0].message.content;

    const replies = text
      .split("\n")
      .map(r => r.replace(/^\d+[\).\s]*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    res.json({ replies });

  } catch (err) {
    console.error("AI ERROR:", err.message);
    res.status(500).json({ error: "AI smart reply failed" });
  }
});

/* ================= CHAT SUMMARY ================= */
router.post("/summary", auth, async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.json({ summary: "" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Summarize this chat in 2 lines:\n${messages.join("\n")}`
        }
      ],
    });

    res.json({
      summary: completion.choices[0].message.content
    });

  } catch (err) {
    console.error("SUMMARY ERROR:", err.message);
    res.status(500).json({ error: "Summary failed" });
  }
});

export default router;
