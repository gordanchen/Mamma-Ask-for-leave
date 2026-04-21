console.log("script.js 已載入");

const API_URL = "https://script.google.com/macros/s/AKfycbyCVj2gM_4ORuY0A_cUkWSVLl6xhzlh1FJLvpSGbNzDUOG_O4ETEnhhKoRDjxlRvQNFOw/exec";
const ADMIN_ALLOWED_NAMES = ["劉恭權", "楊昌訓", "鄭卉晴", "蘇瑞珍", "王妤琪"];

let currentUser = null;
let membersData = [];
let slotGroups = [];
let adminData = [];
let requests = [];
let currentSlot = null;
let editingIndex = null;
let leaveType = "整段請假";
let pendingDeleteIndex = null;

const loginPage = document.getElementById("loginPage");
const mainPage = document.getElementById("mainPage");
const departmentSelect = document.getElementById("departmentSelect");
const memberSelect = document.getElementById("memberSelect");
const enterBtn = document.getElementById("enterBtn");
const backBtn = document.getElementById("backBtn");
const scheduleBtn = document.getElementById("scheduleBtn");
const adminToggleBtn = document.getElementById("adminToggleBtn");
const showUser = document.getElementById("showUser");
const slotGrid = document.getElementById("slotGrid");
const requestList = document.getElementById("requestList");
const summaryMain = document.getElementById("summaryMain");
const summarySub = document.getElementById("summarySub");
const submitBtn = document.getElementById("submitBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const adminCard = document.getElementById("adminCard");
const adminTableBody = document.getElementById("adminTableBody");

const leaveModal = document.getElementById("leaveModal");
const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");
const reasonSelect = document.getElementById("reasonSelect");
const otherReasonWrap = document.getElementById("otherReasonWrap");
const otherReasonInput = document.getElementById("otherReasonInput");
const leaveTypeGrid = document.getElementById("leaveTypeGrid");
const timeWrap = document.getElementById("timeWrap");
const startTimeInput = document.getElementById("startTimeInput");
const endTimeInput = document.getElementById("endTimeInput");
const detailReasonWrap = document.getElementById("detailReasonWrap");
const detailReasonInput = document.getElementById("detailReasonInput");
const noteInput = document.getElementById("noteInput");
const saveModalBtn = document.getElementById("saveModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const reasonErrorText = document.getElementById("reasonErrorText");
const timeErrorText = document.getElementById("timeErrorText");

const scheduleModal = document.getElementById("scheduleModal");
const scheduleModalTitle = document.getElementById("scheduleModalTitle");
const scheduleModalBody = document.getElementById("scheduleModalBody");
const closeScheduleModalBtn = document.getElementById("closeScheduleModalBtn");

const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const toastWrap = document.getElementById("toastWrap");

const confirmModal = document.getElementById("confirmModal");
const confirmText = document.getElementById("confirmText");
const confirmYesBtn = document.getElementById("confirmYesBtn");
const confirmNoBtn = document.getElementById("confirmNoBtn");

function setLoading(show, text = "資料處理中...") {
  loadingText.textContent = text;
  loadingOverlay.classList.toggle("hidden", !show);
}

function showToast(message, type = "info", duration = 2600) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastWrap.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    toast.style.transition = "0.2s ease";
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    ...options
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("API 回傳不是合法 JSON：" + text.slice(0, 200));
  }
}

function normalizeArrayResponse(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.items)) return json.items;
  return [];
}

function findSlotByKey(slotKey) {
  for (const day of slotGroups) {
    const found = (day.items || []).find(item => item.slotKey === slotKey);
    if (found) return { ...found, dateLabel: day.dateLabel };
  }
  return null;
}

function groupSlots(rawSlots) {
  const map = new Map();
  rawSlots.forEach(slot => {
    const dateLabel = slot.dateLabel || "";
    if (!map.has(dateLabel)) {
      map.set(dateLabel, {
        dateLabel,
        slotKey: slot.slotKey ? String(slot.slotKey).slice(0, 4) : dateLabel,
        items: []
      });
    }
    map.get(dateLabel).items.push({
      slotKey: slot.slotKey,
      slotLabel: slot.slotLabel,
      start: slot.start,
      end: slot.end
    });
  });
  return Array.from(map.values());
}

function renderDepartmentOptions() {
  const departments = [...new Set(membersData.map(item => item.department).filter(Boolean))];
  departmentSelect.innerHTML = '<option value="">請選擇部門</option>' +
    departments.map(dep => `<option value="${dep}">${dep}</option>`).join("");
  memberSelect.innerHTML = '<option value="">請先選擇部門</option>';
}

function onDepartmentChange() {
  const dep = departmentSelect.value;
  const members = membersData.filter(item => item.department === dep);
  memberSelect.innerHTML = '<option value="">請選擇人名</option>' +
    members.map(item => `<option value="${item.name}">${item.title}｜${item.name}</option>`).join("");
}

function updateUserDisplay() {
  if (!currentUser) {
    showUser.textContent = "";
    return;
  }
  showUser.innerHTML = `目前登入部門：${currentUser.department}<br>目前登入職稱：${currentUser.title}<br>目前登入人員：${currentUser.name}`;
  const canViewAdmin = ADMIN_ALLOWED_NAMES.includes(currentUser.name);
  adminToggleBtn.classList.toggle("hidden", !canViewAdmin);
  if (!canViewAdmin) adminCard.classList.add("hidden");
}

async function handleEnter() {
  const dep = departmentSelect.value;
  const name = memberSelect.value;

  if (!dep || !name) {
    showToast("請先選擇部門與人名", "error");
    return;
  }

  const found = membersData.find(item => item.department === dep && item.name === name);
  if (!found) {
    showToast("找不到對應成員資料", "error");
    return;
  }

  currentUser = found;
  updateUserDisplay();
  loginPage.classList.add("hidden");
  mainPage.classList.remove("hidden");

  try {
    setLoading(true, "載入個人請假資料...");
    await loadMyRequests(currentUser.name);
    showToast("登入成功", "success");
  } catch (err) {
    console.error("載入個人請假資料失敗：", err);
    showToast("載入個人請假資料失敗", "error");
  } finally {
    setLoading(false);
  }
}

function logout() {
  currentUser = null;
  requests = [];
  renderSummary();
  renderSlots();
  updateUserDisplay();
  loginPage.classList.remove("hidden");
  mainPage.classList.add("hidden");
  adminCard.classList.add("hidden");
  showToast("已切換登入人員", "info");
}

function renderSlots() {
  const filledSlotMap = new Map();
  requests.forEach(item => {
    filledSlotMap.set(item.slotKey, item.leaveType === "整段請假" ? "整段請假" : "已填寫");
  });

  slotGrid.innerHTML = slotGroups.map(day => `
    <div class="day-slot-card">
      <div class="day-slot-date">${day.dateLabel}</div>
      <div class="day-slot-grid">
        ${(day.items || []).map(slot => {
          const isFilled = filledSlotMap.has(slot.slotKey);
          const badgeText = filledSlotMap.get(slot.slotKey) || "";
          return `
            <button class="slot-btn ${isFilled ? "filled" : ""}" data-slot="${slot.slotKey}">
              ${isFilled ? `<span class="slot-badge">${badgeText}</span>` : ""}
              <span class="slot-name">${slot.slotLabel}</span>
              <span class="slot-time">${slot.start} - ${slot.end}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");

  slotGrid.querySelectorAll(".slot-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const slot = findSlotByKey(btn.dataset.slot);
      if (slot) openModal(slot);
    });
  });
}

function clearFieldErrors() {
  reasonSelect.classList.remove("select-error");
  startTimeInput.classList.remove("input-error");
  endTimeInput.classList.remove("input-error");
  reasonErrorText.classList.remove("show");
  timeErrorText.classList.remove("show");
  timeErrorText.textContent = "";
}

function showReasonError() {
  reasonSelect.classList.add("select-error");
  reasonErrorText.classList.add("show");
}

function showTimeError(message) {
  startTimeInput.classList.add("input-error");
  endTimeInput.classList.add("input-error");
  timeErrorText.textContent = message;
  timeErrorText.classList.add("show");
}

function toggleOtherReason() {
  otherReasonWrap.classList.toggle("hidden", reasonSelect.value !== "其他");
}

function enforceTimeBounds() {
  if (!currentSlot) return;

  if (startTimeInput.value && startTimeInput.value < currentSlot.start) startTimeInput.value = currentSlot.start;
  if (startTimeInput.value && startTimeInput.value > currentSlot.end) startTimeInput.value = currentSlot.end;
  if (endTimeInput.value && endTimeInput.value < currentSlot.start) endTimeInput.value = currentSlot.start;
  if (endTimeInput.value && endTimeInput.value > currentSlot.end) endTimeInput.value = currentSlot.end;
  if (startTimeInput.value && endTimeInput.value && startTimeInput.value > endTimeInput.value) {
    endTimeInput.value = startTimeInput.value;
  }
}

function setLeaveType(type) {
  leaveType = type;
  leaveTypeGrid.querySelectorAll(".select-option").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });

  const isPartial = type !== "整段請假";
  timeWrap.classList.toggle("hidden", !isPartial);
  detailReasonWrap.classList.toggle("hidden", !isPartial);

  if (isPartial && currentSlot) {
    if (!startTimeInput.value) startTimeInput.value = currentSlot.start;
    if (!endTimeInput.value) endTimeInput.value = currentSlot.end;
    enforceTimeBounds();
  }
}

function openModal(slot, index = null) {
  currentSlot = slot;
  editingIndex = index;
  modalTitle.textContent = `${slot.dateLabel}｜${slot.slotLabel}`;
  modalSubtitle.textContent = `預設時段 ${slot.start} - ${slot.end}。若有特殊時段，請在晚到／早退或備註中填寫。`;

  if (index !== null) {
    const item = requests[index];
    reasonSelect.value = item.reason;
    otherReasonInput.value = item.reasonOther || "";
    setLeaveType(item.leaveType);
    startTimeInput.value = item.startTime || slot.start;
    endTimeInput.value = item.endTime || slot.end;
    detailReasonInput.value = item.detailReason || "";
    noteInput.value = item.note || "";
  } else {
    const existing = requests.find(item => item.slotKey === slot.slotKey);
    if (existing) {
      reasonSelect.value = existing.reason;
      otherReasonInput.value = existing.reasonOther || "";
      setLeaveType(existing.leaveType);
      startTimeInput.value = existing.startTime || slot.start;
      endTimeInput.value = existing.endTime || slot.end;
      detailReasonInput.value = existing.detailReason || "";
      noteInput.value = existing.note || "";
      editingIndex = requests.findIndex(item => item.slotKey === slot.slotKey);
    } else {
      reasonSelect.value = "";
      otherReasonInput.value = "";
      setLeaveType("整段請假");
      startTimeInput.value = slot.start;
      endTimeInput.value = slot.end;
      detailReasonInput.value = "";
      noteInput.value = "";
    }
  }

  startTimeInput.min = slot.start;
  startTimeInput.max = slot.end;
  endTimeInput.min = slot.start;
  endTimeInput.max = slot.end;

  clearFieldErrors();
  toggleOtherReason();
  enforceTimeBounds();
  leaveModal.classList.add("show");
}

function closeModal() {
  leaveModal.classList.remove("show");
  currentSlot = null;
  editingIndex = null;
  clearFieldErrors();
}

function saveRequest() {
  if (!currentSlot) return;
  clearFieldErrors();

  const reason = reasonSelect.value;
  const reasonOther = otherReasonInput.value.trim();
  const startTime = startTimeInput.value;
  const endTime = endTimeInput.value;
  const detailReason = detailReasonInput.value.trim();
  const note = noteInput.value.trim();

  if (!reason) {
    showReasonError();
    return;
  }

  if (reason === "其他" && !reasonOther) {
    showReasonError();
    return;
  }

  if (leaveType !== "整段請假") {
    if (!startTime || !endTime) {
      showTimeError("請填寫晚到或早退的開始與結束時間");
      return;
    }

    if (startTime < currentSlot.start || startTime > currentSlot.end || endTime < currentSlot.start || endTime > currentSlot.end) {
      showTimeError(`時間只能填寫在 ${currentSlot.start} - ${currentSlot.end} 區間內`);
      enforceTimeBounds();
      return;
    }

    if (startTime >= endTime) {
      showTimeError("開始時間需早於結束時間");
      return;
    }
  }

  const record = {
    slotKey: currentSlot.slotKey,
    dateLabel: currentSlot.dateLabel,
    slotLabel: currentSlot.slotLabel,
    defaultStart: currentSlot.start,
    defaultEnd: currentSlot.end,
    reason,
    reasonOther,
    leaveType,
    startTime,
    endTime,
    detailReason,
    note
  };

  if (editingIndex !== null && editingIndex >= 0) {
    requests[editingIndex] = record;
  } else {
    requests.push(record);
  }

  renderSummary();
  renderSlots();
  closeModal();
  showToast("已加入待送出清單", "success");
}

function renderSummary() {
  if (requests.length === 0) {
    summaryMain.textContent = "尚未新增任何請假時段。";
    summarySub.textContent = "你可以連續新增多筆，最後再一起送出。";
    requestList.innerHTML = '<div class="empty-text">目前沒有資料。</div>';
    return;
  }

  summaryMain.textContent = `目前共填寫 ${requests.length} 筆請假資料。`;
  summarySub.textContent = "下方可以編輯或刪除，確認沒問題後再送出。";

  requestList.innerHTML = requests.map((item, index) => {
    const reasonText = item.reason === "其他" ? `其他：${item.reasonOther}` : item.reason;
    const typeText = item.leaveType === "整段請假" ? "整段請假" : `${item.leaveType} ${item.startTime}-${item.endTime}`;

    return `
      <div class="summary-item">
        <div class="summary-head">
          <div class="summary-title">${item.dateLabel}｜${item.slotLabel}</div>
          <div class="tag">${typeText}</div>
        </div>
        <div class="summary-meta">事由：${reasonText}\n${item.detailReason ? `補充：${item.detailReason}\n` : ""}${item.note ? `備註：${item.note}` : "備註：無"}</div>
        <div class="action-row" style="margin-top: 10px;">
          <button class="btn btn-outline" onclick="editRequest(${index})">編輯</button>
          <button class="btn btn-danger" onclick="deleteRequest(${index})">刪除</button>
        </div>
      </div>
    `;
  }).join("");
}

window.editRequest = function(index) {
  const item = requests[index];
  const slot = findSlotByKey(item.slotKey);
  if (slot) openModal(slot, index);
};

function openDeleteConfirm(index) {
  pendingDeleteIndex = index;
  const item = requests[index];
  confirmText.textContent = `確定要刪除 ${item.dateLabel}｜${item.slotLabel} 嗎？`;
  confirmModal.classList.add("show");
}

function closeDeleteConfirm() {
  confirmModal.classList.remove("show");
  pendingDeleteIndex = null;
}

window.deleteRequest = function(index) {
  openDeleteConfirm(index);
};

async function runDelete(index) {
  const item = requests[index];

  try {
    setLoading(true, "刪除資料中...");
    const json = await fetchJson(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "delete",
        department: currentUser.department,
        name: currentUser.name,
        slotKey: item.slotKey
      })
    });

    if (json.ok === false) {
      throw new Error(json.message || "刪除失敗");
    }

    await loadMyRequests(currentUser.name);
    await loadAdminData();
    showToast("已刪除該請假資料", "success");
  } catch (err) {
    console.error(err);
    showToast("刪除失敗：" + err.message, "error", 3600);
  } finally {
    setLoading(false);
  }
}

function clearAllRequests() {
  if (!requests.length) return;
  requests = [];
  renderSummary();
  renderSlots();
  showToast("已清空目前前端清單", "info");
}

async function submitAll() {
  if (!currentUser) {
    showToast("請先登入", "error");
    return;
  }

  if (!requests.length) {
    showToast("請至少新增一筆請假資料", "error");
    return;
  }

  const payload = {
    type: "submit",
    user: {
      department: currentUser.department,
      title: currentUser.title,
      name: currentUser.name
    },
    data: requests
  };

  try {
    setLoading(true, "送出請假資料中...");
    const json = await fetchJson(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    if (json.ok === false) {
      throw new Error(json.message || "送出失敗");
    }

    if (json.updatedCount > 0) {
      showToast("您已填寫過此時段，同時段已有資料則已自動更新", "info", 3600);
    } else {
      showToast("送出成功！", "success");
    }

    await loadMyRequests(currentUser.name);
    await loadAdminData();
  } catch (err) {
    console.error(err);
    showToast("送出失敗：" + err.message, "error", 3600);
  } finally {
    setLoading(false);
  }
}

function parseRangeText(text = "") {
  const match = String(text).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  return { start: normalizeHHMM(match[1]), end: normalizeHHMM(match[2]) };
}

function normalizeHHMM(value = "") {
  const [h = "00", m = "00"] = String(value).split(":");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(text = "") {
  const [h, m] = normalizeHHMM(text).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseLeaveTypeText(typeText = "") {
  const normalized = String(typeText || "").trim();

  if (!normalized || normalized === "整段請假") {
    return { kind: "full", range: null };
  }

  const kind = normalized.startsWith("晚到")
    ? "late"
    : normalized.startsWith("早退")
      ? "early"
      : "partial";

  const range = parseRangeText(normalized);
  return { kind, range };
}

function calcBetaDutyTime(slotStart, slotEnd, typeText) {
  const parsed = parseLeaveTypeText(typeText);

  if (parsed.kind === "full") return "—";

  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);

  if (!parsed.range) return `${slotStart} - ${slotEnd}`;

  const leaveStart = timeToMinutes(parsed.range.start);
  const leaveEnd = timeToMinutes(parsed.range.end);

  const ranges = [];

  if (leaveStart > slotStartMin) {
    ranges.push(`${minutesToTime(slotStartMin)}-${minutesToTime(leaveStart)}`);
  }

  if (leaveEnd < slotEndMin) {
    ranges.push(`${minutesToTime(leaveEnd)}-${minutesToTime(slotEndMin)}`);
  }

  return ranges.length ? ranges.join(" / ") : "—";
}

function renderNameBadges(list, className = "") {
  if (!list.length) {
    return '<span class="empty-text">無</span>';
  }

  return `
    <div class="name-badge-wrap ${className}">
      ${list.map(text => `<span class="name-badge ${className}">${text}</span>`).join("")}
    </div>
  `;
}

function renderAdminTable() {
  const allMemberNames = membersData.map(item => item.name).filter(Boolean);

  const grouped = slotGroups.map(day => ({
    dateLabel: day.dateLabel,
    items: (day.items || []).map(slot => {
      const leaves = adminData.filter(item => item.slotLabel === slot.slotLabel && item.dateLabel === day.dateLabel);

      const fullLeaveNames = leaves
        .filter(item => parseLeaveTypeText(item.typeText).kind === "full")
        .map(item => item.name);

      const partialLeaves = leaves
        .filter(item => parseLeaveTypeText(item.typeText).kind !== "full")
        .map(item => ({
          name: item.name,
          reasonText: item.reasonText,
          typeText: item.typeText,
          noteText: item.noteText,
          betaDuty: calcBetaDutyTime(slot.start, slot.end, item.typeText)
        }));

      const attendanceNames = allMemberNames.filter(name => !fullLeaveNames.includes(name));

      const leaveNamesWithReason = leaves.map(item => `${item.name}｜${item.reasonText}`);
      const partialNamesWithType = partialLeaves.map(item => `${item.name}｜${item.typeText}`);
      const betaDutyLines = partialLeaves.map(item => `${item.name}｜${item.betaDuty}`);

      return {
        slotLabel: slot.slotLabel,
        timeText: `${slot.start} - ${slot.end}`,
        attendanceNames,
        leaveNamesWithReason,
        partialNamesWithType,
        betaDutyLines
      };
    })
  }));

  adminTableBody.innerHTML = grouped.map(day => `
    <tr>
      <td colspan="6" class="admin-day-header">${day.dateLabel}</td>
    </tr>
    ${day.items.map(slot => `
      <tr>
        <td class="admin-slot-label">${slot.slotLabel}</td>
        <td class="admin-slot-time">${slot.timeText}</td>
        <td>${renderNameBadges(slot.attendanceNames, "badge-attend")}</td>
        <td>${renderNameBadges(slot.leaveNamesWithReason, "badge-leave")}</td>
        <td>${renderNameBadges(slot.partialNamesWithType, "badge-partial")}</td>
        <td>${renderNameBadges(slot.betaDutyLines, "badge-duty")}</td>
      </tr>
    `).join("")}
  `).join("");
}

async function loadMembers() {
  const json = await fetchJson(API_URL + "?type=members");
  const data = normalizeArrayResponse(json);
  if (!data.length) throw new Error("members API 沒有回傳名單陣列");
  membersData = data;
  renderDepartmentOptions();
}

async function loadSlots() {
  const json = await fetchJson(API_URL + "?type=config");
  const data = normalizeArrayResponse(json);
  if (!data.length) throw new Error("config API 沒有回傳時段陣列");
  slotGroups = groupSlots(data);
  renderSlots();
}

async function loadAdminData() {
  const json = await fetchJson(
    API_URL + "?type=admin&_ts=" + Date.now(),
    { cache: "no-store" }
  );

  const data = normalizeArrayResponse(json);
  adminData = data.map(item => ({
    dateLabel: item.dateLabel || "",
    slotLabel: item.slotLabel || "",
    name: item.name || "",
    reasonText: item.reasonText || item.reason || "",
    typeText: item.typeText || (
      item.leaveType === "整段請假"
        ? "整段請假"
        : `${item.leaveType || ""} ${item.startTime || ""}-${item.endTime || ""}`.trim()
    ),
    noteText: item.noteText || item.note || ""
  }));

  renderAdminTable();
}

async function loadMyRequests(name) {
  const json = await fetchJson(API_URL + "?type=myRequests&name=" + encodeURIComponent(name));
  const data = normalizeArrayResponse(json);

  requests = data.map(item => ({
    slotKey: item.slotKey,
    dateLabel: item.dateLabel,
    slotLabel: item.slotLabel,
    defaultStart: item.defaultStart,
    defaultEnd: item.defaultEnd,
    reason: item.reason,
    reasonOther: item.reasonOther,
    leaveType: item.leaveType,
    startTime: item.startTime,
    endTime: item.endTime,
    detailReason: item.detailReason,
    note: item.note
  }));

  renderSummary();
  renderSlots();
}

function openSchedule() {
  if (!currentUser) return;

  scheduleModalTitle.textContent = `${currentUser.name} 的課表`;
  scheduleModalBody.innerHTML = "";
  scheduleModal.classList.add("show");

  const url = currentUser.scheduleUrl || "";
  if (!url) {
    scheduleModalBody.innerHTML = '<div class="schedule-empty">因為你沒有將課表放置群組相簿所以您的課表無法在此查看</div>';
    return;
  }

  const img = new Image();
  img.className = "schedule-image";
  img.onload = () => {
    scheduleModalBody.innerHTML = "";
    scheduleModalBody.appendChild(img);
  };
  img.onerror = () => {
    scheduleModalBody.innerHTML = '<div class="schedule-empty">因為你沒有將課表放置群組相簿所以您的課表無法在此查看</div>';
  };
  img.src = url;
}

function closeScheduleModal() {
  scheduleModal.classList.remove("show");
  scheduleModalBody.innerHTML = "";
}

function bindEvents() {
  departmentSelect.addEventListener("change", onDepartmentChange);
  enterBtn.addEventListener("click", handleEnter);
  backBtn.addEventListener("click", logout);
  scheduleBtn.addEventListener("click", openSchedule);
  closeScheduleModalBtn.addEventListener("click", closeScheduleModal);

  adminToggleBtn.addEventListener("click", async () => {
    if (!currentUser || !ADMIN_ALLOWED_NAMES.includes(currentUser.name)) return;

    adminCard.classList.toggle("hidden");
    adminToggleBtn.textContent = adminCard.classList.contains("hidden") ? "查看總覽" : "收起總覽";

    if (!adminCard.classList.contains("hidden")) {
      try {
        setLoading(true, "更新總覽資料中...");
        await loadAdminData();
      } catch (err) {
        console.error("開啟總覽時更新失敗：", err);
      } finally {
        setLoading(false);
      }
    }
  });

  reasonSelect.addEventListener("change", () => {
    toggleOtherReason();
    clearFieldErrors();
  });

  startTimeInput.addEventListener("input", () => {
    clearFieldErrors();
    enforceTimeBounds();
  });

  endTimeInput.addEventListener("input", () => {
    clearFieldErrors();
    enforceTimeBounds();
  });

  leaveTypeGrid.addEventListener("click", event => {
    const btn = event.target.closest(".select-option");
    if (!btn) return;
    setLeaveType(btn.dataset.type);
  });

  saveModalBtn.addEventListener("click", saveRequest);
  closeModalBtn.addEventListener("click", closeModal);
  submitBtn.addEventListener("click", submitAll);
  clearAllBtn.addEventListener("click", clearAllRequests);

  leaveModal.addEventListener("click", event => {
    if (event.target === leaveModal) closeModal();
  });

  scheduleModal.addEventListener("click", event => {
    if (event.target === scheduleModal) closeScheduleModal();
  });

  confirmNoBtn.addEventListener("click", closeDeleteConfirm);
  confirmYesBtn.addEventListener("click", async () => {
    if (pendingDeleteIndex === null) return;
    const targetIndex = pendingDeleteIndex;
    closeDeleteConfirm();
    await runDelete(targetIndex);
  });

  confirmModal.addEventListener("click", event => {
    if (event.target === confirmModal) closeDeleteConfirm();
  });
}

async function init() {
  bindEvents();
  renderSummary();

  setInterval(async () => {
    try {
      await loadAdminData();
    } catch (err) {
      console.error("自動更新總覽失敗：", err);
    }
  }, 5000);

  try {
    setLoading(true, "初始化資料中...");
    await loadMembers();
    await loadSlots();
    await loadAdminData();
  } catch (err) {
    console.error("初始化失敗：", err);
    showToast("初始化失敗：" + err.message, "error", 5000);
  } finally {
    setLoading(false);
  }
}

init();