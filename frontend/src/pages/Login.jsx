import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

import toast from "react-hot-toast";

export default function Login({ setAuthToken }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post("http://localhost:5000/auth/login", {
                username,
                password,
            });

            const token = res.data.token;
            localStorage.setItem("authToken", token);
            setAuthToken(token);
            toast.success("Welcome back!");
            navigate("/app");
        } catch (err) {
            const errorMsg = err.response?.data?.error || "Login Failed";
            setError(errorMsg);
            toast.error(errorMsg);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0f172a] text-white">
            <div className="w-96 bg-[#1e293b] p-8 rounded-xl shadow-xl border border-[#334155]">
                <div className="mb-5 text-center">
                    <Link to="/" className="text-xs text-gray-500 hover:text-indigo-400 transition flex items-center justify-center gap-1">
                        ← Back to Home
                    </Link>
                </div>
                <h2 className="text-2xl font-bold mb-6 text-center text-indigo-400">
                    DataIntel Login
                </h2>
                {error && <p className="text-red-400 mb-4 text-sm text-center">{error}</p>}
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-[#0f172a] text-white border border-[#334155] p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[#0f172a] text-white border border-[#334155] p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-indigo-500 hover:bg-indigo-600 p-3 rounded-lg font-semibold transition"
                    >
                        Sign In
                    </button>
                </form>
                <p className="mt-4 text-center text-sm text-gray-400">
                    Don't have an account?{" "}
                    <Link to="/register" className="text-indigo-400 hover:underline">
                        Register
                    </Link>
                </p>
            </div>
        </div>
    );
}
