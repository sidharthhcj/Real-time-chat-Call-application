import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

export default function Chat() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [message, setMessage] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [loading, setLoading] = useState(false);

  // 🔥 WebRTC
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [callState, setCallState] = useState("idle"); // idle | calling | incoming | in-call
  const [incomingFrom, setIncomingFrom] = useState(null);
  const pendingOfferRef = useRef(null);

  const navigate = useNavigate();

  const loggedUser = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");
  const myId = token ? JSON.parse(atob(token.split(".")[1])).id : null;

  const messages = messagesByRoom[currentRoom] || [];

  /* ================= USERS ================= */
  useEffect(() => {
    if (!token) return navigate("/login");

    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setUsers(res.data))
      .catch(() => alert("Failed to load users"));
  }, [token, navigate]);

  /* ================= SOCKET ================= */
  useEffect(() => {
    if (!token) return;

    const s = io(import.meta.env.VITE_BACKEND_URL, {
      transports: ["websocket"],
      auth: { token },
    });

    setSocket(s);

    s.on("receive-message", (data) => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [data.roomId]: [
          ...(prev[data.roomId] || []),
          { message: data.message, sender: data.sender, _id: Date.now() },
        ],
      }));
    });

    s.on("incoming-call", ({ from, offer }) => {
      pendingOfferRef.current = offer;
      setIncomingFrom(from);
      setCallState("incoming");
    });

    s.on("call-accepted", async ({ answer }) => {
      if (pcRef.current && answer) {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        setCallState("in-call");
      }
    });

    s.on("ice-candidate", async ({ candidate }) => {
      if (pcRef.current && candidate) {
        await pcRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    });

    s.on("end-call", () => cleanupPeer());

    return () => {
      cleanupPeer();
      s.disconnect();
    };
  }, [token]);

  /* ================= CHAT ================= */
  const joinChat = async (user) => {
    setSelectedUser(user);
    const roomId = [myId, user._id].sort().join("_");
    socket.emit("join-room", roomId);
    setCurrentRoom(roomId);

    setLoading(true);
    const res = await axios.get(
      `${import.meta.env.VITE_BACKEND_URL}/api/messages/${roomId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setMessagesByRoom((prev) => ({
      ...prev,
      [roomId]: res.data.map((m) => ({
        _id: m._id,
        message: m.content,
        sender: m.sender._id === myId ? "me" : m.sender._id,
      })),
    }));
    setLoading(false);
  };

  const sendMessage = () => {
    if (!message.trim()) return;

    socket.emit("send-message", {
      roomId: currentRoom,
      message,
      receiver: selectedUser._id,
    });

    setMessagesByRoom((prev) => ({
      ...prev,
      [currentRoom]: [
        ...(prev[currentRoom] || []),
        { message, sender: "me", _id: Date.now() },
      ],
    }));

    setMessage("");
  };

  /* ================= WEBRTC ================= */
  const cleanupPeer = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    localStream?.getTracks().forEach((t) => t.stop());
    remoteStream?.getTracks().forEach((t) => t.stop());

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    setLocalStream(null);
    setRemoteStream(null);
    setIncomingFrom(null);
    pendingOfferRef.current = null;
    setCallState("idle");
  };

  const createPeerConnection = (remoteId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", { to: remoteId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pcRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    setCallState("calling");
    const pc = createPeerConnection(selectedUser._id);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    setLocalStream(stream);
    localVideoRef.current.srcObject = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("call-user", { to: selectedUser._id, offer });
  };

  const acceptCall = async () => {
    const pc = createPeerConnection(incomingFrom);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    setLocalStream(stream);
    localVideoRef.current.srcObject = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription(
      new RTCSessionDescription(pendingOfferRef.current)
    );

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer-call", { to: incomingFrom, answer });
    setCallState("in-call");
  };

  const endCall = () => {
    socket.emit("end-call", {
      to: incomingFrom || selectedUser?._id,
    });
    cleanupPeer();
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white">

      {/* ================= LEFT PANEL ================= */}
      <div className="w-1/4 border-r border-slate-700 flex flex-col">

        {/* Header */}
        <div className="p-4 text-lg font-semibold bg-slate-950 border-b border-slate-700">
          💬 Chats
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="m-2 px-3 py-2 rounded-lg bg-slate-800 outline-none text-sm"
        />

        {/* Users list */}
        <div className="flex-1 overflow-y-auto">
          {users.length === 0 ? (
            <div className="p-4 text-slate-400 text-center">Loading users...</div>
          ) : (
            users
              .filter((u) =>
                u.username.toLowerCase().includes(search.toLowerCase())
              )
              .map((user) => (
                <div
                  key={user._id}
                  onClick={() => joinChat(user)}
                  className={`p-4 cursor-pointer hover:bg-slate-800 transition
                    ${selectedUser?._id === user._id ? "bg-slate-800 border-l-2 border-blue-500" : ""}
                  `}
                >
                  <div className="font-medium">👤 {user.username}</div>
                  <div className="text-xs text-slate-400">
                    {selectedUser?._id === user._id ? "Active" : "Click to chat"}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* ================= RIGHT PANEL ================= */}
      <div className="w-3/4 flex flex-col">

        {/* 🔥 TOP NAVBAR WITH LOGOUT */}
        <div className="p-4 bg-slate-950 border-b border-slate-700 flex justify-between items-center">
          <span className="text-lg font-bold">💬 Chat App</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300">
              👤 {loggedUser?.username || "User"}
            </span>
            {selectedUser && callState === "idle" && (
              <button
                onClick={startCall}
                className="bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-lg text-sm font-medium transition"
              >
                📞 Call
              </button>
            )}

            {(callState === "in-call" || callState === "calling") && (
              <button
                onClick={endCall}
                className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg text-sm font-medium transition"
              >
                🔴 Hangup
              </button>
            )}

            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              🚪 Logout
            </button>
          </div>
        </div>

        {/* Chat header */}
        <div className="p-4 bg-slate-900 border-b border-slate-700">
          {selectedUser ? (
            <div className="font-semibold">
              💬 Chat with {selectedUser.username}
            </div>
          ) : (
            <div className="text-slate-400">
              👈 Select a user from the list to start chatting
            </div>
          )}
        </div>

        {/* Video area for calls */}
        {(callState === "in-call" || callState === "calling" || callState === "incoming") && (
          <div className="p-2 bg-slate-900 border-b border-slate-700 flex gap-4 items-start">
            <div className="w-1/3 bg-black rounded overflow-hidden">
              <video
                autoPlay
                playsInline
                muted
                ref={(el) => {
                  if (el && localStream) el.srcObject = localStream;
                }}
                className="w-full h-48 object-cover"
              />
            </div>
            <div className="flex-1 bg-black rounded overflow-hidden">
              <video
                autoPlay
                playsInline
                ref={(el) => {
                  if (el && remoteStream) el.srcObject = remoteStream;
                }}
                className="w-full h-48 object-cover"
              />
            </div>
          </div>
        )}

        {/* Incoming call UI */}
        {callState === "incoming" && (
          <div className="p-4 bg-yellow-600 text-black flex items-center justify-between">
            <div>📞 Incoming call from {incomingFrom === myId ? "You" : incomingFrom}</div>
            <div className="flex gap-2">
              <button onClick={acceptCall} className="bg-green-600 px-3 py-2 rounded">Accept</button>
              <button onClick={declineCall} className="bg-red-600 px-3 py-2 rounded">Decline</button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="text-center text-slate-400">Loading messages...</div>
          )}

          {selectedUser && !loading && messages.length === 0 && (
            <div className="text-center text-slate-500">
              No messages yet. Start a conversation! 💬
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m._id}
              className={`flex ${m.sender === "me" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[60%] px-4 py-2 rounded-2xl text-sm
                  ${m.sender === "me"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-white"
                  }`}
              >
                {m.message}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        {selectedUser ? (
          <div className="p-4 bg-slate-950 border-t border-slate-700 flex gap-2">
            <input
              className="flex-1 bg-slate-800 rounded-lg px-4 py-2 outline-none text-white placeholder-slate-400"
              placeholder={`Message ${selectedUser.username}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              onClick={sendMessage}
              disabled={!message.trim()}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-500 px-6 py-2 rounded-lg font-medium transition"
            >
              Send
            </button>
          </div>
        ) : (
          <div className="p-4 bg-slate-950 border-t border-slate-700 text-slate-400 text-center">
            Select a user to start messaging
          </div>
        )}
      </div>
    </div>
  );
}