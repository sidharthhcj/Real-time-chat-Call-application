# 💬 Real-Time Chat Application

A full-stack real-time chat application with private messaging and audio/video calling.
live link->https://real-time-chat-call-application.onrender.com/
## 🚀 Features
- User authentication (JWT)
- One-to-one real-time chat using Socket.IO
- Message persistence with MongoDB
- WebRTC-based audio/video calling
- Secure socket authentication
- Responsive UI with React & TailwindCSS

## 🛠 Tech Stack
### Frontend
- React (Vite)
- TailwindCSS
- Socket.IO Client
- Axios

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- Socket.IO
- WebRTC (Signaling)
- JWT Authentication

## 🔑 Environment Variables
Create a `.env` file in `backend/`:

```env
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret
PORT=5000

