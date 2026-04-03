import numpy as np
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("landing.html")


@app.route("/simulate")
def simulate_page():
    embed = request.args.get("embed") == "1"
    return render_template("index.html", embed=embed)


@app.route("/api/simulate", methods=["POST"])
def simulate():
    data = request.json
    # Parameter default dari frontend
    E = float(data.get("E", 1.0))
    V0 = float(data.get("V0", 2.0))
    is_infinite_barrier = bool(data.get("V0_infinite", False))
    L = float(data.get("L", 1.0))

    # --- 1. Persiapan Kuantitas Fisika ---
    # Menggunakan satuan disederhanakan: hbar^2 / 2m = 1
    if is_infinite_barrier:
        # Pseudo-infinity agar T sangat kecil tanpa overflow di exp()
        V0 = 100.0

    if E <= 0:
        E = 1e-5  # Menghindari pembagian dengan nol

    # Bilangan gelombang di wilayah 1 (x < 0)
    k1 = np.sqrt(E)

    # Bilangan gelombang di wilayah 2 (dalam penghalang, 0 <= x <= L)
    # Jika E > V0, k2 riil. Jika E < V0, k2 imajiner (i*kappa)
    kappa = np.sqrt(abs(V0 - E))
    if E > V0:
        k2 = np.sqrt(E - V0) + 0j
    else:
        k2 = 1j * kappa

    if np.abs(k2) < 1e-8:
        k2 = 1e-8 + 0j

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
    x_min = float(data.get("x_min", -5.0))
    x_max = float(data.get("x_max", 5.0))

    if x_min >= x_max:
        x_min = -5.0
        x_max = 5.0

    def points_for(length, density, min_points):
        return max(min_points, int(length * density))

    def make_region(start, end, points):
        if end <= start:
            return np.array([])
        return np.linspace(start, end, points)

    density_free = 30.0
    density_barrier = 50.0

    x1_end = min(0.0, x_max)
    x2_start = max(0.0, x_min)
    x2_end = min(L, x_max)
    x3_start = max(L, x_min)

    # Resolusi array ruang (disesuaikan dengan rentang)
    x1 = make_region(
        x_min,
        x1_end,
        points_for(x1_end - x_min, density_free, 50),
    )
    x2 = make_region(
        x2_start,
        x2_end,
        points_for(x2_end - x2_start, density_barrier, 30),
    )
    x3 = make_region(
        x3_start,
        x_max,
        points_for(x_max - x3_start, density_free, 50),
    )

    # Menghitung persamaan fungsi gelombang di setiap wilayah
    psi1 = np.exp(1j * k1 * x1) + r * np.exp(-1j * k1 * x1)
    psi2 = A * np.exp(1j * k2 * x2) + B * np.exp(-1j * k2 * x2)
    psi3 = t * np.exp(1j * k1 * x3)

    # Menggabungkan array ruang dan probabilitas kerapatan |psi|^2
    x_segments = []
    psi_segments = []
    if x1.size:
        x_segments.append(x1)
        psi_segments.append(psi1)
    if x2.size:
        x_segments.append(x2)
        psi_segments.append(psi2)
    if x3.size:
        x_segments.append(x3)
        psi_segments.append(psi3)

    x_all = np.concatenate(x_segments)
    psi_all = np.concatenate(psi_segments)
    psi_sq = np.abs(psi_all) ** 2

    # --- 4. Fungsi Potensial Background ---
    V_array = np.zeros_like(x_all)
    V_plot = 100.0 if is_infinite_barrier else V0
    V_array[(x_all >= 0) & (x_all <= L)] = V_plot

    # Amplop probabilitas fisik (|psi|^2) tanpa skala bergantung V0/E
    psi_plot = psi_sq

    # Komponen kompleks untuk animasi gelombang Real(Psi) berjalan
    psi_real_scaled = (np.real(psi_all)).tolist()
    psi_imag_scaled = (np.imag(psi_all)).tolist()

    return jsonify(
        {
            "x": x_all.tolist(),
            "psi_sq": psi_plot.tolist(),
            "psi_real": psi_real_scaled,
            "psi_imag": psi_imag_scaled,
            "V": V_array.tolist(),
            "V_display": V_plot,
            "E": E,
            "V0": V0,
            "V0_infinite": is_infinite_barrier,
            "T": T,
            "R": R,
            "L": L,
            "k1": float(np.real(k1)),
            "k2_real": float(np.real(k2)),
            "k2_imag": float(np.imag(k2)),
            "kappa": float(kappa),
            "t_abs": float(np.abs(t)),
            "r_abs": float(np.abs(r)),
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
