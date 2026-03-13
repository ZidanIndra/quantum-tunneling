import numpy as np
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/simulate", methods=["POST"])
def simulate():
    data = request.json
    # Parameter default dari frontend
    E = float(data.get("E", 1.0))
    V0 = float(data.get("V0", 2.0))
    L = float(data.get("L", 1.0))

    # --- 1. Persiapan Kuantitas Fisika ---
    # Menggunakan satuan disederhanakan: hbar^2 / 2m = 1

    if E == 0:
        E = 1e-5  # Menghindari pembagian dengan nol

    # Bilangan gelombang di wilayah 1 (x < 0)
    k1 = np.sqrt(E)

    # Bilangan gelombang di wilayah 2 (dalam penghalang, 0 <= x <= L)
    # Jika E > V0, k2 riil. Jika E < V0, k2 imajiner (i*kappa)
    if E > V0:
        k2 = np.sqrt(E - V0) + 0j
    else:
        k2 = 1j * np.sqrt(V0 - E)

    # --- 2. Perhitungan Koefisien Transmisi dan Refleksi ---
    # Menggunakan metode pencocokan syarat batas (boundary matching)

    # Denominator umum
    denom = (k1 + k2) ** 2 * np.exp(-1j * k2 * L) - (k1 - k2) ** 2 * np.exp(1j * k2 * L)

    # Amplitudo Transmisi (t)
    t = (4 * k1 * k2 * np.exp(-1j * k1 * L)) / denom

    # Amplitudo Refleksi (r)
    num_r = (k1**2 - k2**2) * (np.exp(-1j * k2 * L) - np.exp(1j * k2 * L))
    r = num_r / denom

    # Amplitudo di dalam penghalang (A dan B)
    A = 0.5 * (1 + k1 / k2) * t * np.exp(1j * (k1 - k2) * L)
    B = 0.5 * (1 - k1 / k2) * t * np.exp(1j * (k1 + k2) * L)

    # Probabilitas Fisis
    T = np.abs(t) ** 2  # Koefisien Transmisi

    # Menghindari error floating point
    T = min(1.0, max(0.0, float(T)))
    R = 1.0 - T  # Koefisien Refleksi

    # --- 3. Penyusunan Array Fungsi Gelombang untuk Visualisasi ---
    x_min = -3.0
    x_max = L + 3.0

    # Resolusi array ruang
    x1 = np.linspace(x_min, 0, 150)
    x2 = np.linspace(0, L, 50)
    x3 = np.linspace(L, x_max, 150)

    # Menghitung persamaan fungsi gelombang di setiap wilayah
    psi1 = np.exp(1j * k1 * x1) + r * np.exp(-1j * k1 * x1)
    psi2 = A * np.exp(1j * k2 * x2) + B * np.exp(-1j * k2 * x2)
    psi3 = t * np.exp(1j * k1 * x3)

    # Menggabungkan array ruang dan probabilitas kerapatan |psi|^2
    x_all = np.concatenate((x1, x2, x3))
    psi_all = np.concatenate((psi1, psi2, psi3))
    psi_sq = np.abs(psi_all) ** 2

    # --- 4. Fungsi Potensial Background ---
    V_array = np.zeros_like(x_all)
    V_array[(x_all >= 0) & (x_all <= L)] = V0

    # Skalakan tinggi gelombang agar pas dilihat (ditumpuk di garis energi E)
    scale_factor = max(1.0, V0) * 0.3
    psi_plot = E + psi_sq * scale_factor

    # Skalakan komponen kompleks untuk animasi gelombang Real(Psi) berjalan
    scale_factor_wave = scale_factor * 0.8
    psi_real_scaled = (np.real(psi_all) * scale_factor_wave).tolist()
    psi_imag_scaled = (np.imag(psi_all) * scale_factor_wave).tolist()

    return jsonify(
        {
            "x": x_all.tolist(),
            "psi_sq": psi_plot.tolist(),
            "psi_real": psi_real_scaled,
            "psi_imag": psi_imag_scaled,
            "V": V_array.tolist(),
            "E": E,
            "T": T,
            "R": R,
            "L": L,
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
