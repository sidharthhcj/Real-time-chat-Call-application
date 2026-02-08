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

  const [callState, setCallState] = useState("idle"); // idle | calling | incoming | in-call
  const [incomingFrom, setIncomingFrom] = useState(null);
  const pendingOfferRef = useRef(null);

  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const loggedUser = JSON.parse(localStorage.getItem("user"));
  const myId = token ? JSON.parse(atob(token.split(".")[1])).id : null;

  const messages = messagesByRoom[currentRoom] || [];

  /* ================= USERS ================= */
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
      await pcRef.current.setRemoteDescription(answer);
      setCallState("in-call");
    });

    s.on("ice-candidate", async ({ candidate }) => {
      if (candidate) await pcRef.current.addIceCandidate(candidate);
    });

    s.on("end-call", () => cleanupPeer());

    return () => {
      cleanupPeer();
      s.disconnect();
    };
  }, []);

  /* ================= HELPERS ================= */
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

  const createPeer = (remoteId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit("ice-candidate", { to: remoteId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    pcRef.current = pc;
    return pc;
  };

  /* ================= CALL ================= */
  const startCall = async () => {
    const pc = createPeer(selectedUser._id);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    setLocalStream(stream);
    localVideoRef.current.srcObject = stream;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("call-user", { to: selectedUser._id, offer });
    setCallState("calling");
  };

  const acceptCall = async () => {
    const pc = createPeer(incomingFrom);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    setLocalStream(stream);
    localVideoRef.current.srcObject = stream;

    await pc.setRemoteDescription(pendingOfferRef.current);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer-call", { to: incomingFrom, answer });
    setCallState("in-call");
  };

  const endCall = () => {
    socket.emit("end-call", { to: incomingFrom || selectedUser?._id });
    cleanupPeer();
  };

  /* ================= CHAT ================= */
  const joinChat = (user) => {
    setSelectedUser(user);
    const roomId = [myId, user._id].sort().join("_");
    socket.emit("join-room", roomId);
    setCurrentRoom(roomId);
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

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  /* ================= UI ================= */
  return (
    <div className="flex h-screen bg-slate-900 text-white">

      {/* USERS */}
      <div className="hidden md:flex w-1/4 border-r border-slate-700 flex-col">
        <div className="p-4 font-bold">Chats</div>
        {users.map((u) => (
          <div key={u._id} onClick={() => joinChat(u)} className="p-3 hover:bg-slate-800 cursor-pointer">
            {u.username}
          </div>
        ))}
      </div>

      {/* CHAT */}
      <div className="flex flex-col flex-1">

        {/* TOP BAR */}
        <div className="p-3 bg-slate-950 flex justify-between items-center">
          <span>{selectedUser?.username}</span>
          <div className="flex gap-2">
            {callState === "idle" && selectedUser && (
              <button onClick={startCall} className="bg-indigo-600 px-3 py-1 rounded">📞</button>
            )}
            {callState !== "idle" && (
              <button onClick={endCall} className="bg-red-600 px-3 py-1 rounded">🔴</button>
            )}
            <button onClick={logout} className="bg-red-700 px-3 py-1 rounded">Logout</button>
          </div>
        </div>

        {/* VIDEO */}
        {callState !== "idle" && (
          <div className="flex gap-2 p-2 bg-black">
            <video ref={localVideoRef} autoPlay muted className="w-1/3 h-40 object-cover" />
            <video ref={remoteVideoRef} autoPlay className="flex-1 h-40 object-cover" />
          </div>
        )}

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m._id} className={`my-1 ${m.sender === "me" ? "text-right" : ""}`}>
              <span className="inline-block bg-slate-700 px-3 py-1 rounded">{m.message}</span>
            </div>
          ))}
        </div>

        {/* INPUT (FIXED FOR MOBILE) */}
        {selectedUser && (
          <div className="sticky bottom-0 p-2 bg-slate-950 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1 bg-slate-800 p-2 rounded"
              placeholder="Type message..."
            />
            <button onClick={sendMessage} className="bg-green-600 px-4 rounded">Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
