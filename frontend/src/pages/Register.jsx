import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

import toast from "react-hot-toast";

export default function Register() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post("http://localhost:5000/auth/register", {
                username,
                password,
            });

            toast.success("Registered Successfully!");
            navigate("/login");
        } catch (err) {
            setError(err.response?.data?.error || "Registration Failed");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0f172a] text-white">
            <div className="w-96 bg-[#1e293b] p-8 rounded-xl shadow-xl border border-[#334155]">
                <h2 className="text-2xl font-bold mb-6 text-center text-indigo-400">
                    Create Account
                </h2>
                {error && <p className="text-red-400 mb-4 text-sm text-center">{error}</p>}
                <form onSubmit={handleRegister} className="space-y-4">
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
                        className="w-full bg-cyan-500 hover:bg-cyan-600 p-3 rounded-lg font-semibold transition"
                    >
                        Register
                    </button>
                </form>
                <p className="mt-4 text-center text-sm text-gray-400">
                    Already have an account?{" "}
                    <Link to="/login" className="text-indigo-400 hover:underline">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    );
}
