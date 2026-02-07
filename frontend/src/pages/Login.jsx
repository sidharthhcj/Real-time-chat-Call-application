import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const navigate = useNavigate();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.post(
        "http://localhost:5000/api/auth/login",
        form
      );

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      navigate("/chat");
    } catch (err) {
      alert("Wrong credentials, please signup");
      navigate("/signup");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-slate-800 p-8 rounded-2xl shadow-lg text-white"
      >
        <h2 className="text-2xl font-bold text-center mb-6">
          🔐 Login
        </h2>

        <input
          name="email"
          placeholder="Email"
          onChange={handleChange}
          className="w-full mb-4 px-4 py-2 rounded-lg bg-slate-700 outline-none"
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          onChange={handleChange}
          className="w-full mb-6 px-4 py-2 rounded-lg bg-slate-700 outline-none"
        />

        <button className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-semibold">
          Login
        </button>

        <p className="text-center text-sm text-slate-400 mt-4">
          New here?{" "}
          <span
            className="text-blue-400 cursor-pointer"
            onClick={() => navigate("/signup")}
          >
            Signup
          </span>
        </p>
      </form>
    </div>
  );
}
