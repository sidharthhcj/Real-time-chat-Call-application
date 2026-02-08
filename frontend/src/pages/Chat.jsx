import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

export default function Chat() {
  const navigate = useNavigate();

  /* ================= STATE ================= */
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUsers, setShowUsers] = useState(true); // 🔥 mobile screen switch
  const [socket, setSocket] = useState(null);

  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [currentRoom, setCurrentRoom] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  /* ================= CALL STATE ================= */
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = useRef(null);

  const [callState, setCallState] = useState("idle"); // idle | calling | incoming | in-call
  const [incomingFrom, setIncomingFrom] = useState(null);
  const pendingOfferRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  /* ================= AUTH ================= */
  const token = localStorage.getItem("token");
  const loggedUser = JSON.parse(localStorage.getItem("user"));
  const myId = token ? JSON.parse(atob(token.split(".")[1])).id : null;

  const messages = messagesByRoom[currentRoom] || [];

  /* ================= FETCH USERS ================= */
  useEffect(() => {
    if (!token) return navigate("/login");

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
      if (pcRef.current && answer) {
        await pcRef.current.setRemoteDescription(answer);
        setCallState("in-call");
      }
    });

    s.on("ice-candidate", async ({ candidate }) => {
      if (pcRef.current && candidate) {
        await pcRef.current.addIceCandidate(candidate);
      }
    });

    s.on("end-call", cleanupCall);

    return () => {
      cleanupCall();
      s.disconnect();
    };
  }, []);

  /* ================= VIDEO STREAM BIND ================= */
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

  /* ================= CHAT ================= */
  const joinChat = async (user) => {
    setSelectedUser(user);
    setShowUsers(false); // 📱 mobile → open chat

    const roomId = [myId, user._id].sort().join("_");
    setCurrentRoom(roomId);
    socket.emit("join-room", roomId);

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

  /* ================= CALL HELPERS ================= */
  const createPeer = (to) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("ice-candidate", { to, candidate: e.candidate });
    };

    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pcRef.current = pc;
    return pc;
  };

  const startCall = async () => {
    setCallState("calling");
    const pc = createPeer(selectedUser._id);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    setLocalStream(stream);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("call-user", { to: selectedUser._id, offer });
  };

  const acceptCall = async () => {
    const pc = createPeer(incomingFrom);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    setLocalStream(stream);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription(pendingOfferRef.current);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer-call", { to: incomingFrom, answer });
    setCallState("in-call");
  };

  const cleanupCall = () => {
    pcRef.current?.close();
    pcRef.current = null;
    localStream?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setCallState("idle");
    setIncomingFrom(null);
  };

  /* ================= UI ================= */
  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">

      {/* USERS LIST */}
      <div
        className={`${showUsers ? "flex" : "hidden"} md:flex w-full md:w-1/4 border-r border-slate-700 flex-col`}
      >
        <div className="p-4 font-bold bg-slate-950">💬 Chats</div>
        <input
          className="m-2 px-3 py-2 bg-slate-800 rounded"
          placeholder="Search user..."
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1 overflow-y-auto">
          {users
            .filter((u) => u.username.toLowerCase().includes(search.toLowerCase()))
            .map((u) => (
              <div
                key={u._id}
                onClick={() => joinChat(u)}
                className="p-4 hover:bg-slate-800 cursor-pointer"
              >
                👤 {u.username}
              </div>
            ))}
        </div>
      </div>

      {/* CHAT PANEL */}
      <div className={`${showUsers ? "hidden" : "flex"} md:flex flex-col w-full md:w-3/4`}>

        {/* HEADER */}
        <div className="p-3 bg-slate-950 flex items-center gap-2 border-b">
          <button className="md:hidden" onClick={() => setShowUsers(true)}>←</button>
          <span className="flex-1 font-semibold">
            {selectedUser?.username || "Chat App"}
          </span>
          {selectedUser && callState === "idle" && (
            <button onClick={startCall} className="bg-indigo-600 px-3 py-1 rounded">
              📞
            </button>
          )}
        </div>

        {/* VIDEO */}
        {(callState !== "idle") && (
          <div className="flex gap-2 p-2">
            <video ref={localVideoRef} autoPlay muted className="w-1/3 bg-black" />
            <video ref={remoteVideoRef} autoPlay className="flex-1 bg-black" />
          </div>
        )}

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m._id} className={`flex ${m.sender === "me" ? "justify-end" : ""}`}>
              <div className="bg-slate-700 px-3 py-2 rounded m-1">{m.message}</div>
            </div>
          ))}
        </div>

        {/* INPUT */}
        {selectedUser && (
          <div className="p-2 flex gap-2 border-t bg-slate-950">
            <input
              className="flex-1 px-3 py-2 bg-slate-800 rounded"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type message..."
            />
            <button onClick={sendMessage} className="bg-green-600 px-4 rounded">
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
