const app = {
  modelsLoaded: false,
  users: [],
  videoEl: document.getElementById("video-feed"),
  canvas: document.getElementById("overlay-canvas"),
  snapshotCanvas: document.getElementById("snapshot-canvas"),
  stream: null,
  scanInterval: null,
  currentMode: null,
  tempUser: null,
  facingMode: "user",
  actionCallback: null,

  init: async function () {
    this.loadUsers();
    await this.loadModels();
  },

  showToast: function (msg, type = "info") {
    const t = document.getElementById("toast-container");
    const icon = document.getElementById("toast-icon");
    document.getElementById("toast-msg").innerText = msg;

    icon.className =
      type === "error"
        ? "ph-fill ph-warning-circle text-red-500 text-xl"
        : type === "success"
        ? "ph-fill ph-check-circle text-brand-500 text-xl"
        : "ph-fill ph-info text-blue-500 text-xl";

    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  },

  switchView: function (viewId) {
    document
      .querySelectorAll(".view-screen")
      .forEach((el) => el.classList.remove("active"));
    document.getElementById(`view-${viewId}`).classList.add("active");
    if (viewId === "users") this.renderUsersList();
  },

  loadUsers: function () {
    try {
      const data = localStorage.getItem("aegis_users");
      if (data) {
        const parsed = JSON.parse(data);
        this.users = parsed.map((u) => ({
          ...u,
          descriptor: new Float32Array(u.descriptorData),
        }));
      }
    } catch (e) {
      console.error("Error loading users:", e);
      this.users = [];
    }
  },

  saveUsers: function () {
    const dataToSave = this.users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      image: u.image,
      descriptorData: Array.from(u.descriptor),
    }));
    localStorage.setItem("aegis_users", JSON.stringify(dataToSave));
  },

  confirmDelete: function (userId) {
    document.getElementById("confirm-msg").innerText =
      "Are you sure you want to delete this profile?";
    this.actionCallback = () => {
      this.users = this.users.filter((u) => u.id !== userId);
      this.saveUsers();
      this.renderUsersList();
      this.showToast("Profile deleted", "success");
      this.closeConfirm();
    };
    document.getElementById("confirm-modal").classList.add("active");
  },

  confirmClearAll: function () {
    if (this.users.length === 0)
      return this.showToast("Database is already empty.");
    document.getElementById("confirm-msg").innerText =
      "Delete ALL profiles? This cannot be undone.";
    this.actionCallback = () => {
      this.users = [];
      this.saveUsers();
      this.showToast("All profiles cleared", "success");
      this.closeConfirm();
    };
    document.getElementById("confirm-modal").classList.add("active");
  },

  closeConfirm: function () {
    document.getElementById("confirm-modal").classList.remove("active");
  },

  setupConfirm: function () {
    document
      .getElementById("btn-confirm-action")
      .addEventListener("click", () => {
        if (this.actionCallback) this.actionCallback();
      });
  },

  loadModels: async function () {
    this.showToast("Initializing scanner...", "info");
    try {
      const MODEL_URL =
        "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      this.modelsLoaded = true;
      this.showToast("Scanner Ready.", "success");
    } catch (e) {
      console.error("Model load error:", e);
      this.showToast("Network Error: Setup failed.", "error");
    }
  },

  startCamera: async function (mode) {
    if (!this.modelsLoaded)
      return this.showToast("AI Models not loaded yet.", "error");
    this.currentMode = mode;
    this.switchView("camera");

    document.getElementById("scan-laser").style.display = "block";
    document.getElementById("scan-progress-bar").style.width = "0%";

    if (this.stream) this.stopCamera(false);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.facingMode,
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });
      this.videoEl.srcObject = this.stream;

      this.videoEl.style.transform =
        this.facingMode === "user" ? "scaleX(-1)" : "scaleX(1)";

      this.videoEl.onloadedmetadata = () => {
        this.videoEl.play();
        this.canvas.width = this.videoEl.videoWidth;
        this.canvas.height = this.videoEl.videoHeight;
        this.startScanningLoop();
      };
    } catch (e) {
      console.error(e);
      this.showToast("Camera access denied.", "error");
      this.switchView("home");
    }
  },

  stopCamera: function (switchBack = true) {
    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (switchBack) this.switchView("home");
  },

  toggleCameraFacing: function () {
    this.facingMode = this.facingMode === "user" ? "environment" : "user";
    this.startCamera(this.currentMode);
  },

  proceedToScanner: function () {
    const name = document.getElementById("reg-name").value.trim();
    const role =
      document.getElementById("reg-role").value.trim() ||
      "No Role Assigned";
    if (!name) return this.showToast("Please enter a name.", "error");

    this.tempUser = { id: "usr_" + Date.now(), name, role };

    const btn = document.getElementById("btn-capture");
    btn.classList.remove("hidden");
    btn.disabled = true;
    btn.innerText = "Align Face...";
    btn.className =
      "w-full bg-slate-200 text-slate-400 font-bold text-[16px] py-3.5 rounded-full btn-press transition-all";

    document.getElementById("scan-status-title").innerText =
      "Register Identity";
    document.getElementById("scan-instruction-title").innerText =
      "Scanning...";
    document.getElementById("scan-instruction").innerText =
      "Position your face clearly within the frame to register.";

    this.startCamera("register");
  },

  startLiveScan: function () {
    const btn = document.getElementById("btn-capture");
    btn.classList.add("hidden");
    document.getElementById("scan-status-title").innerText =
      "Live Verification";
    document.getElementById("scan-instruction-title").innerText =
      "Authenticating...";
    document.getElementById("scan-instruction").innerText =
      "Look steadily at the camera to verify your identity.";
    this.startCamera("live");
  },

  startScanningLoop: async function () {
    const displaySize = {
      width: this.videoEl.videoWidth,
      height: this.videoEl.videoHeight,
    };
    faceapi.matchDimensions(this.canvas, displaySize);

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.3,
    });

    this.scanInterval = setInterval(async () => {
      if (!this.videoEl || this.videoEl.paused || this.videoEl.ended)
        return;

      const detection = await faceapi
        .detectSingleFace(this.videoEl, options)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const ctx = this.canvas.getContext("2d");
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (detection) {
        const resizedDetections = faceapi.resizeResults(
          detection,
          displaySize,
        );

        faceapi.draw.drawFaceLandmarks(this.canvas, resizedDetections, {
          drawLines: true,
          color: "rgba(20, 184, 166, 0.5)",
          lineWidth: 1,
        });

        if (this.currentMode === "register") {
          this.handleRegisterUI(detection);
        } else if (this.currentMode === "live") {
          this.handleLiveScanUI(detection);
        }
      } else {
        if (this.currentMode === "register") {
          const btn = document.getElementById("btn-capture");
          btn.disabled = true;
          btn.innerText = "Align Face...";
          btn.className =
            "w-full bg-slate-200 text-slate-400 font-bold text-[16px] py-3.5 rounded-full btn-press transition-all";
          document.getElementById("scan-progress-bar").style.width = "0%";
        }
      }
    }, 150);
  },

  handleRegisterUI: function (detection) {
    document.getElementById("scan-progress-bar").style.width = "100%";
    const btn = document.getElementById("btn-capture");

    if (btn.disabled) {
      playBeep("success");
      btn.disabled = false;
      btn.innerText = "Save Face Data";
      btn.className =
        "w-full bg-brand-600 text-white font-bold text-[16px] py-3.5 rounded-full shadow-[0_8px_20px_rgba(13,148,136,0.3)] btn-press transition-all";
      this.tempUser.descriptor = detection.descriptor;
      this.tempUser.box = detection.detection.box;
    }
  },

  handleLiveScanUI: function (detection) {
    if (this.users.length === 0) {
      document.getElementById("scan-instruction").innerText =
        "No profiles in database. Please register first.";
      return;
    }

    const labeledDescriptors = this.users.map(
      (u) => new faceapi.LabeledFaceDescriptors(u.id, [u.descriptor]),
    );
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
    const match = faceMatcher.findBestMatch(detection.descriptor);

    if (match.label !== "unknown") {
      const matchedUser = this.users.find((u) => u.id === match.label);
      if (matchedUser) {
        playBeep("success");
        clearInterval(this.scanInterval);
        document.getElementById("scan-progress-bar").style.width = "100%";

        setTimeout(
          () => this.showResultScreen(matchedUser, match.distance),
          500,
        );
      }
    }
  },

  captureFace: function () {
    if (!this.tempUser || !this.tempUser.descriptor) return;

    const box = this.tempUser.box;
    const ctx = this.snapshotCanvas.getContext("2d");

    const pad = box.width * 0.3;
    const sX = Math.max(0, box.x - pad);
    const sY = Math.max(0, box.y - pad);
    const sW = Math.min(
      this.videoEl.videoWidth - sX,
      box.width + pad * 2,
    );
    const sH = Math.min(
      this.videoEl.videoHeight - sY,
      box.height + pad * 2,
    );

    this.snapshotCanvas.width = sW;
    this.snapshotCanvas.height = sH;

    if (this.facingMode === "user") {
      ctx.translate(sW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.videoEl, sX, sY, sW, sH, 0, 0, sW, sH);

    this.tempUser.image = this.snapshotCanvas.toDataURL(
      "image/jpeg",
      0.8,
    );
    delete this.tempUser.box;

    this.users.push(this.tempUser);
    this.saveUsers();

    this.showToast("Profile Saved!", "success");

    document.getElementById("reg-name").value = "";
    document.getElementById("reg-role").value = "";
    this.tempUser = null;

    this.stopCamera(true);
  },

  showResultScreen: function (user, distance) {
    this.stopCamera(false);

    document.getElementById("res-img").src = user.image;
    document.getElementById("res-name").innerText = user.name;
    document.getElementById("res-role").innerText = user.role;

    const confidencePercent = Math.max(
      0,
      Math.round((1 - distance) * 100),
    );

    const confText = document.getElementById("res-confidence-text");
    const confBar = document.getElementById("res-confidence-bar");

    confText.innerText = `${confidencePercent}%`;
    confBar.style.width = "0%";

    this.switchView("result");

    setTimeout(() => {
      confBar.style.width = `${confidencePercent}%`;
      if (confidencePercent > 85)
        confBar.className =
          "h-full bg-brand-500 rounded-full transition-all duration-1000 ease-out";
      else if (confidencePercent > 60)
        confBar.className =
          "h-full bg-yellow-500 rounded-full transition-all duration-1000 ease-out";
      else
        confBar.className =
          "h-full bg-orange-500 rounded-full transition-all duration-1000 ease-out";
    }, 100);
  },

  renderUsersList: function () {
    const list = document.getElementById("users-list");
    const empty = document.getElementById("no-users");
    list.innerHTML = "";

    if (this.users.length === 0) {
      empty.classList.remove("hidden");
      empty.classList.add("flex");
    } else {
      empty.classList.add("hidden");
      empty.classList.remove("flex");

      this.users.forEach((u) => {
        const item = document.createElement("div");
        item.className =
          "bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4";
        item.innerHTML = `
            <img src="${u.image}" class="w-14 h-14 rounded-full object-cover border-2 border-slate-50">
            <div class="flex-1">
                <h4 class="font-bold text-slate-800">${u.name}</h4>
                <p class="text-xs font-medium text-brand-600 bg-brand-50 inline-block px-2 py-0.5 rounded-full mt-1">${u.role}</p>
            </div>
            <button onclick="app.confirmDelete('${u.id}')" class="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center btn-press hover:bg-red-100 transition-colors">
                <i class="ph-bold ph-trash"></i>
            </button>
        `;
        list.appendChild(item);
      });
    }
  },
};

window.onload = () => {
  app.setupConfirm();
  app.init();
};