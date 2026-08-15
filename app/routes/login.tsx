import { createRoute } from 'honox/factory'

export default createRoute((c) => {
    return c.render(
        <div class="min-h-screen flex items-center justify-center bg-gray-100">
            <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-200">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-extrabold text-[#0d5fa3]">BotPanel PRO</h1>
                    <p class="text-gray-500 mt-2">Masuk untuk mengelola sistem relay</p>
                </div>

                <form id="loginForm" class="space-y-6">
                    <div id="errorBox" class="hidden p-4 bg-red-100 border-l-4 border-red-500 text-red-800 rounded text-sm font-bold"></div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Username</label>
                        <input type="text" id="username" placeholder="Masukkan username" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#1d8eed] outline-none transition" required />
                    </div>
                    
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Password</label>
                        <input type="password" id="password" placeholder="Masukkan password" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#1d8eed] outline-none transition" required />
                    </div>

                    <button type="submit" class="w-full bg-[#0d5fa3] hover:bg-[#1d8eed] text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-transform hover:-translate-y-1">
                        Masuk Ke Panel
                    </button>
                </form>

                <script dangerouslySetInnerHTML={{__html: `
                    document.getElementById('loginForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const user = document.getElementById('username').value;
                        const pass = document.getElementById('password').value;
                        const errBox = document.getElementById('errorBox');
                        
                        errBox.classList.add('hidden');
                        
                        try {
                            const res = await fetch('/api/auth/login', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ username: user, password: pass })
                            });
                            
                            const data = await res.json();
                            if (data.success) {
                                window.location.href = '/';
                            } else {
                                errBox.textContent = data.error;
                                errBox.classList.remove('hidden');
                            }
                        } catch (err) {
                            errBox.textContent = 'Gagal terhubung ke server';
                            errBox.classList.remove('hidden');
                        }
                    });
                `}} />
            </div>
        </div>
    )
})
