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

  // WebRTC
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [callState, setCallState] = useState("idle");
  const [incomingFrom, setIncomingFrom] = useState(null);
  const pendingOfferRef = useRef(null);

  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const loggedUser = JSON.parse(localStorage.getItem("user"));
  const myId = token ? JSON.parse(atob(token.split(".")[1])).id : null;

  const messages = messagesByRoom[currentRoom] || [];

  /* ================= VIDEO STREAM FIX ================= */
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  /* ================= FETCH USERS ================= */
  useEffect(() => {
    if (!token) return navigate("/");

    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setUsers(res.data))
      .catch(() => alert("Failed to load users"));
  }, []);

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
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState("in-call");
    });

    s.on("ice-candidate", async ({ candidate }) => {
      if (candidate) await pcRef.current.addIceCandidate(candidate);
    });

    s.on("end-call", cleanupPeer);

    return () => s.disconnect();
  }, []);

  /* ================= CHAT ================= */
  const joinChat = async (user) => {
    setSelectedUser(user);
    const roomId = [myId, user._id].sort().join("_");
    setCurrentRoom(roomId);
    socket.emit("join-room", roomId);

    setLoading(true);
    const res = await axios.get(
      `${import.meta.env.VITE_BACKEND_URL}/api/messages/${roomId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setMessagesByRoom((p) => ({
      ...p,
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

    setMessagesByRoom((p) => ({
      ...p,
      [currentRoom]: [...(p[currentRoom] || []), { message, sender: "me", _id: Date.now() }],
    }));

    setMessage("");
  };

  /* ================= WEBRTC ================= */
  const createPeer = (id) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => e.candidate && socket.emit("ice-candidate", { to: id, candidate: e.candidate });
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);

    pcRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    setCallState("calling");
    const pc = createPeer(selectedUser._id);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("call-user", { to: selectedUser._id, offer });
  };

  const acceptCall = async () => {
    const pc = createPeer(incomingFrom);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer-call", { to: incomingFrom, answer });
    setCallState("in-call");
  };

  const cleanupPeer = () => {
    pcRef.current?.close();
    localStream?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setCallState("idle");
  };

  /* ================= UI ================= */
  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">

      {/* SIDEBAR (hidden on mobile) */}
      <div className="hidden md:flex md:w-1/4 border-r border-slate-700 flex-col">
        <div className="p-4 font-bold bg-slate-950">💬 Chats</div>
        <input className="m-2 p-2 rounded bg-slate-800" placeholder="Search" onChange={(e) => setSearch(e.target.value)} />
        <div className="flex-1 overflow-y-auto">
          {users.filter(u => u.username.includes(search)).map(u => (
            <div key={u._id} onClick={() => joinChat(u)}
              className="p-4 hover:bg-slate-800 cursor-pointer">
              👤 {u.username}
            </div>
          ))}
        </div>
      </div>

      {/* CHAT PANEL */}
      <div className="w-full md:w-3/4 flex flex-col">

        {/* TOP BAR */}
        <div className="p-2 md:p-4 bg-slate-950 flex justify-between items-center">
          {selectedUser && <button className="md:hidden" onClick={() => setSelectedUser(null)}>←</button>}
          <span>💬 Chat App</span>
          <div className="flex gap-2">
            {selectedUser && callState === "idle" && <button onClick={startCall}>📞</button>}
            {callState !== "idle" && <button onClick={cleanupPeer}>🔴</button>}
          </div>
        </div>

        {/* VIDEO */}
        {(callState !== "idle") && (
          <div className="flex gap-2 p-2 bg-black">
            <video ref={localVideoRef} autoPlay muted className="w-1/3 h-40" />
            <video ref={remoteVideoRef} autoPlay className="flex-1 h-40" />
          </div>
        )}

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto p-3">
          {messages.map(m => (
            <div key={m._id} className={`flex ${m.sender === "me" ? "justify-end" : ""}`}>
              <div className="bg-slate-700 px-3 py-2 rounded mb-2">{m.message}</div>
            </div>
          ))}
        </div>

        {/* INPUT */}
        {selectedUser && (
          <div className="p-2 bg-slate-950 flex gap-2 sticky bottom-0">
            <input
              className="flex-1 p-2 rounded bg-slate-800"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage} className="bg-green-600 px-4 rounded">Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
