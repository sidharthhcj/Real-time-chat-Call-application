import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Signup() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const navigate = useNavigate();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/auth/signup`,
        form);
      alert("Signup successful, please login");
      navigate("/");
    } catch {
      alert("Signup failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-900">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-slate-800 p-8 rounded-2xl shadow-lg text-white"
      >
        <h2 className="text-2xl font-bold text-center mb-6">
          📝 Signup
        </h2>

        <input
          name="username"
          placeholder="Username"
          onChange={handleChange}
          className="w-full mb-4 px-4 py-2 rounded-lg bg-slate-700 outline-none"
        />

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

        <button className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-lg font-semibold">
          Signup
        </button>

        <p className="text-center text-sm text-slate-400 mt-4">
          Already have an account?{" "}
          <span
            className="text-green-400 cursor-pointer"
            onClick={() => navigate("/login")}
          >
            Login
          </span>
        </p>
      </form>
    </div>
  );
}
