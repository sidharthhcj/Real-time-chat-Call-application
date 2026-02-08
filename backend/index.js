import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Message from "./models/Message.js";
import messageRoutes from "./routes/messageRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
// const allowedOrigins = [
//   "http://localhost:5173",
//   "https://real-time-chat-call-application.onrender.com"
// ];

// // middleware
// app.use(cors({
//   origin: allowedOrigins,
//   credentials: true
// }));
const allowedOrigins = [
  "http://localhost:5173",
  "https://real-time-chat-call-application.onrender.com"
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (Postman, mobile apps)
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

// 🔥 VERY IMPORTANT (preflight fix)
app.options("*", cors());


app.use(express.json());

// routes
app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);
// socket


// map of userId -> socketId for signaling
const onlineUsers = new Map();

// SOCKET AUTH 
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

// socket events
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.userId);
  // register online user for signaling
  onlineUsers.set(socket.userId, socket.id);

  // helper to get socket id by user id
  const getSocketId = (userId) => onlineUsers.get(userId);

  // Join private room
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`🟢 User joined room: ${roomId}`);
  });

  // Send message to room
  socket.on("send-message", async ({ roomId, message, receiver }) => {
    try {
      // Save message to DB
      const newMessage = await Message.create({
        sender: socket.userId,
        receiver,
        content: message,
        roomId,
      });

      // Send to room
      socket.to(roomId).emit("receive-message", {
        message,
        sender: socket.userId,
        roomId,
      });
    } catch (err) {
      console.error("Error saving message:", err);
      socket.emit("error", { message: "Failed to save message" });
    }
  });

  // --- WebRTC signaling handlers ---
  // Caller sends offer to callee: { to, offer }
  socket.on("call-user", ({ to, offer }) => {
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("incoming-call", {
        from: socket.userId,
        offer,
      });
    }
  });

  // Callee sends answer back to caller: { to, answer }
  socket.on("answer-call", ({ to, answer }) => {
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call-accepted", {
        from: socket.userId,
        answer,
      });
    }
  });

  // ICE candidates relay: { to, candidate }
  socket.on("ice-candidate", ({ to, candidate }) => {
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", {
        from: socket.userId,
        candidate,
      });
    }
  });

  // End call notification
  socket.on("end-call", ({ to }) => {
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit("end-call", { from: socket.userId });
    }
  });

socket.on("disconnect", () => {
  console.log("❌ Socket disconnected:", socket.userId);
  onlineUsers.delete(socket.userId);
});

});


// start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    server.listen(process.env.PORT || 5000, () => {
      console.log("🚀 Server + Socket running on port 5000");
    });
  })
  .catch(err => console.log(err));
