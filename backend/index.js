import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import Message from "./models/Message.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

/* ================= CORS ================= */
const allowedOrigins = [
  "http://localhost:5173",
  "https://real-time-chat-call-application.onrender.com"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);

/* ================= SOCKET.IO (🔥 MISSING PART FIXED) ================= */
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

/* ================= SOCKET AUTH ================= */
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("No token"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

/* ================= SOCKET EVENTS ================= */
io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.userId);

  onlineUsers.set(socket.userId, socket.id);

  const getSocketId = (userId) => onlineUsers.get(userId);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
  });

  socket.on("send-message", async ({ roomId, message, receiver }) => {
    try {
      await Message.create({
        sender: socket.userId,
        receiver,
        content: message,
        roomId,
      });

      socket.to(roomId).emit("receive-message", {
        message,
        sender: socket.userId,
        roomId,
      });
    } catch (err) {
      socket.emit("error", { message: "Failed to save message" });
    }
  });

  socket.on("call-user", ({ to, offer }) => {
    const target = getSocketId(to);
    if (target) {
      io.to(target).emit("incoming-call", {
        from: socket.userId,
        offer,
      });
    }
  });

  socket.on("answer-call", ({ to, answer }) => {
    const target = getSocketId(to);
    if (target) {
      io.to(target).emit("call-accepted", {
        from: socket.userId,
        answer,
      });
    }
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    const target = getSocketId(to);
    if (target) {
      io.to(target).emit("ice-candidate", {
        from: socket.userId,
        candidate,
      });
    }
  });

  socket.on("end-call", ({ to }) => {
    const target = getSocketId(to);
    if (target) {
      io.to(target).emit("end-call", { from: socket.userId });
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.userId);
    console.log("❌ Socket disconnected:", socket.userId);
  });
});

/* ================= SERVER ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    server.listen(process.env.PORT || 5000, () => {
      console.log("🚀 Server + Socket running");
    });
  })
  .catch(console.error);
