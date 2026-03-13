// Menunggu DOM ter-load penuh
document.addEventListener("DOMContentLoaded", () => {
  // 1. Pemetaan Referensi Elemen UI
  const sliders = {
    E: document.getElementById("energy-slider"),
    V0: document.getElementById("v0-slider"),
    L: document.getElementById("length-slider"),
  };

  const inputs = {
    E: document.getElementById("energy-input"),
    V0: document.getElementById("v0-input"),
    L: document.getElementById("length-input"),
  };

  const outputs = {
    T_text: document.getElementById("val-transmission"),
    R_text: document.getElementById("val-reflection"),
    T_bar: document.getElementById("bar-transmission"),
    R_bar: document.getElementById("bar-reflection"),
    info: document.getElementById("info-text"),
  };

  const btnReset = document.getElementById("btn-reset");
  const btnPause = document.getElementById("btn-pause");
  const plotContainer = document.getElementById("plot-container");

  const viewSliders = {
    zoom: document.getElementById("zoom-slider"),
    speed: document.getElementById("speed-slider"),
  };

  const viewInputs = {
    zoom: document.getElementById("zoom-input"),
    speed: document.getElementById("speed-input"),
  };

  const baseRange = { x: [-5, 5], y: [-5, 5] };
  let viewState = {
    zoom: 1.0,
    speed: 1.0,
    xRange: [...baseRange.x],
    yRange: [...baseRange.y],
  };

  // 2. State Aplikasi Dasar
  let currentData = {
    E: 1.0,
    V0: 2.0,
    L: 1.0,
    x_min: viewState.xRange[0],
    x_max: viewState.xRange[1],
  };
  let plotInitialized = false; // Flag untuk Plotly
  let simulationResult = null; // Menyimpan hasil komputasi dari backend
  let animationId = null; // ID untuk requestAnimationFrame
  let plotEventsAttached = false;
  let animationPaused = false;
  let pauseOffset = 0;
  let pausedAt = 0;

  // 3. Logika Event Listeners
  // Fungsi untuk menyinkronkan UI Slider & Input Box
  function syncControls(id, value) {
    sliders[id].value = value;
    inputs[id].value = value;
    currentData[id] = parseFloat(value);
    fetchSimulationData();
  }

  Object.keys(sliders).forEach((key) => {
    // Event saat slider digeser secara kontinu
    sliders[key].addEventListener("input", (e) => {
      inputs[key].value = e.target.value;
      currentData[key] = parseFloat(e.target.value);
      fetchSimulationData(); // Request real-time update
    });

    // Event saat input box diisi secara manual
    inputs[key].addEventListener("change", (e) => {
      let val = parseFloat(e.target.value);
      const min = parseFloat(e.target.min);
      const max = parseFloat(e.target.max);

      // Validasi batas minimal & maksimal
      if (val < min) val = min;
      if (val > max) val = max;

      sliders[key].value = val;
      e.target.value = val;
      currentData[key] = val;
      fetchSimulationData();
    });
  });

  // Event Klik Reset Button
  btnReset.addEventListener("click", () => {
    syncControls("E", 1.0);
    syncControls("V0", 2.0);
    syncControls("L", 1.0);
  });

  btnPause.addEventListener("click", () => {
    if (animationPaused) {
      animationPaused = false;
      pauseOffset = performance.now() - pausedAt;
      btnPause.innerText = "Pause Animasi";
    } else {
      animationPaused = true;
      pausedAt = performance.now() - pauseOffset;
      btnPause.innerText = "Lanjutkan Animasi";
    }
  });

  function getAnimTime() {
    return animationPaused ? pausedAt : performance.now() - pauseOffset;
  }

  function applyZoom() {
    const xCenter = (viewState.xRange[0] + viewState.xRange[1]) / 2;
    const yCenter = (viewState.yRange[0] + viewState.yRange[1]) / 2;

    const baseHalfX = (baseRange.x[1] - baseRange.x[0]) / 2;
    const baseHalfY = (baseRange.y[1] - baseRange.y[0]) / 2;

    const halfX = baseHalfX / viewState.zoom;
    const halfY = baseHalfY / viewState.zoom;

    viewState.xRange = [xCenter - halfX, xCenter + halfX];
    viewState.yRange = [yCenter - halfY, yCenter + halfY];
    currentData.x_min = viewState.xRange[0];
    currentData.x_max = viewState.xRange[1];

    if (plotInitialized) {
      Plotly.relayout(plotContainer, {
        "xaxis.range": viewState.xRange,
        "yaxis.range": viewState.yRange,
      });
    }

    fetchSimulationData();
  }

  function syncViewControl(id, value) {
    viewSliders[id].value = value;
    viewInputs[id].value = value;

    const numericValue = parseFloat(value);
    if (id === "zoom") {
      viewState.zoom = numericValue;
      applyZoom();
    } else if (id === "speed") {
      viewState.speed = numericValue;
    }
  }

  Object.keys(viewSliders).forEach((key) => {
    viewSliders[key].addEventListener("input", (e) => {
      syncViewControl(key, e.target.value);
    });

    viewInputs[key].addEventListener("change", (e) => {
      let val = parseFloat(e.target.value);
      const min = parseFloat(e.target.min);
      const max = parseFloat(e.target.max);

      if (val < min) val = min;
      if (val > max) val = max;

      syncViewControl(key, val);
    });
  });

  // 4. API Fetching ke Backend Flask
  async function fetchSimulationData() {
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentData),
      });
      const data = await response.json();
      simulationResult = data;
      updateUI(data); // Render balasan dari server

      // Mulai loop animasi jika belum berjalan
      if (!animationId) {
        animateWave();
      }
    } catch (error) {
      console.error("Error saat fetch API:", error);
    }
  }

  // 5. Update UI dan Konten Informasi
  function updateUI(data) {
    // A. Panggil fungsi render Plotly (Struktur dasar grafik)
    renderPlot(data);

    // B. Update Persentase Output Analitik
    const T_percent = (data.T * 100).toFixed(1);
    const R_percent = (data.R * 100).toFixed(1);

    outputs.T_text.innerText = `${T_percent}%`;
    outputs.R_text.innerText = `${R_percent}%`;

    // Animasi bar width CSS
    outputs.T_bar.style.width = `${T_percent}%`;
    outputs.R_bar.style.width = `${R_percent}%`;

    // C. Update Dynamic Tooltip (Edukasi Fisika)
    if (data.E < data.V0) {
      outputs.info.innerHTML = `<strong>Kasus Kuantum (Tunneling):</strong> Energi partikel (E=${data.E.toFixed(1)}) lebih rendah dari Tinggi Penghalang (V₀=${data.V0.toFixed(1)}). Secara klasik partikel akan terpantul, namun mekanika kuantum membuktikan ada <strong>${T_percent}%</strong> probabilitas gelombang dapat menembus penghalang.`;
    } else if (data.E > data.V0) {
      outputs.info.innerHTML = `<strong>Energi Ekstra:</strong> Energi partikel (E=${data.E.toFixed(1)}) melebihi Penghalang (V₀=${data.V0.toFixed(1)}). Secara klasik 100% tembus, namun secara kuantum <strong>${R_percent}%</strong> gelombang terpantul akibat perubahan mendadak pada medan potensial.`;
    } else {
      outputs.info.innerHTML = `Energi partikel (E) sama dengan tinggi penghalang (V₀). Keadaan transisi kuantum.`;
    }
  }

  // 6. Konfigurasi dan Rendering Plotly.js
  function renderPlot(data) {
    // Trace 0: Area Blok Penghalang Potensial
    const traceV = {
      x: data.x,
      y: data.V,
      type: "scatter",
      mode: "none",
      fill: "tozeroy",
      fillcolor: "rgba(241, 196, 15, 0.35)", // Emas/kuning
      name: "Penghalang (V₀)",
      hoverinfo: "none",
    };

    // Trace 1: Garis Energi Kinetik Partikel (E)
    const traceE = {
      x: data.x,
      y: Array(data.x.length).fill(data.E),
      type: "scatter",
      mode: "lines",
      line: {
        color: "#e74c3c", // Merah
        width: 2,
        dash: "dashdot",
      },
      name: "Tingkat Energi (E)",
      hoverinfo: "none",
    };

    // Trace 2: Amplop Probabilitas Kerapatan (|ψ|²)
    const tracePsiSq = {
      x: data.x,
      y: data.psi_sq,
      type: "scatter",
      mode: "lines",
      line: {
        color: "rgba(52, 152, 219, 0.4)", // Biru transparan
        width: 1,
        shape: "spline",
        smoothing: 1.3,
      },
      fill: "tonexty",
      fillcolor: "rgba(52, 152, 219, 0.15)", // Fill transparan
      name: "Amplop Probabilitas",
    };

    // Trace 3: Gelombang Berjalan (Real Part of Psi)
    // Hitung posisi awal gelombang berdasarkan waktu agar tidak flicker
    const time = getAnimTime() * 0.005 * viewState.speed;
    const phase = data.E * time;
    const cos_p = Math.cos(phase);
    const sin_p = Math.sin(phase);

    let wave_y = data.x.map((_, i) => {
      let val = data.psi_real[i] * cos_p + data.psi_imag[i] * sin_p;
      return data.E + val;
    });

    const traceWave = {
      x: data.x,
      y: wave_y,
      type: "scatter",
      mode: "lines",
      line: {
        color: "#2980b9", // Biru gelap solid
        width: 2.5,
        shape: "spline",
        smoothing: 1.3,
      },
      name: "Gelombang Re(Ψ)",
    };

    // Konfigurasi Tata Letak Grafik
    const layout = {
      title: {
        text: "Simulasi Quantum Tunneling (Animasi Gelombang Berjalan)",
        font: { size: 16 },
      },
      xaxis: {
        title: "Posisi Ruang (x)",
        range: viewState.xRange,
        zeroline: true,
        zerolinecolor: "#bdc3c7",
        showgrid: true,
        gridcolor: "#ecf0f1",
      },
      yaxis: {
        title: "Tingkat Energi & Amplitudo",
        range: viewState.yRange,
        zeroline: true,
        zerolinecolor: "#bdc3c7",
      },
      margin: { t: 50, l: 60, r: 30, b: 60 },
      showlegend: true,
      legend: {
        orientation: "h",
        y: -0.15,
        x: 0.5,
        xanchor: "center",
      },
      dragmode: "pan",
      uirevision: "view",
      plot_bgcolor: "#ffffff",
      paper_bgcolor: "#ffffff",
      hovermode: "x",
    };

    const config = {
      responsive: true,
      displayModeBar: false,
      scrollZoom: true,
    };

    if (!plotInitialized) {
      Plotly.newPlot(
        "plot-container",
        [traceV, traceE, tracePsiSq, traceWave],
        layout,
        config,
      );
      plotInitialized = true;

      if (!plotEventsAttached) {
        plotContainer.on("plotly_relayout", (eventData) => {
          const x0 = eventData["xaxis.range[0]"];
          const x1 = eventData["xaxis.range[1]"];
          const y0 = eventData["yaxis.range[0]"];
          const y1 = eventData["yaxis.range[1]"];

          if (x0 !== undefined && x1 !== undefined) {
            viewState.xRange = [x0, x1];
          }
          if (y0 !== undefined && y1 !== undefined) {
            viewState.yRange = [y0, y1];
          }

          if (eventData["xaxis.autorange"] || eventData["yaxis.autorange"]) {
            viewState.xRange = [...baseRange.x];
            viewState.yRange = [...baseRange.y];
            applyZoom();
          }
        });
        plotEventsAttached = true;
      }
    } else {
      Plotly.react(
        "plot-container",
        [traceV, traceE, tracePsiSq, traceWave],
        layout,
        config,
      );
    }
  }

  // 7. Loop Animasi Kuantum (requestAnimationFrame)
  function animateWave() {
    if (!simulationResult || !plotInitialized) {
      animationId = requestAnimationFrame(animateWave);
      return;
    }

    const data = simulationResult;
    if (animationPaused) {
      animationId = requestAnimationFrame(animateWave);
      return;
    }

    const time = getAnimTime() * 0.005 * viewState.speed; // Faktor kecepatan animasi

    // Frekuensi osilasi bergantung pada Energi (E)
    const phase = data.E * time;
    const cos_p = Math.cos(phase);
    const sin_p = Math.sin(phase);

    let wave_y = new Array(data.x.length);
    for (let i = 0; i < data.x.length; i++) {
      // Re(Psi(x,t)) = Re(psi(x) * exp(-iEt))
      // = psi_real * cos(Et) + psi_imag * sin(Et)
      let val = data.psi_real[i] * cos_p + data.psi_imag[i] * sin_p;
      wave_y[i] = data.E + val; // Offset sesuai tingkat energi
    }

    // Update hanya koordinat Y dari Trace ke-3 (Gelombang Re(Ψ))
    Plotly.restyle("plot-container", { y: [wave_y] }, [3]);

    // Lanjutkan loop
    animationId = requestAnimationFrame(animateWave);
  }

  // Eksekusi awal
  fetchSimulationData();
});
